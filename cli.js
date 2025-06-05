#!/usr/bin/env node

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_ORG = "johnlindquist";
const DEFAULT_REPO = "get-rules";
const RULES_PATH = ".cursor/rules";

// Parse optional org/repo argument
const userArg = process.argv[2];
let org = DEFAULT_ORG;
let repo = DEFAULT_REPO;
if (userArg && /^[^/]+\/[^/]+$/.test(userArg)) {
	[org, repo] = userArg.split("/");
	console.log(`Using custom repo: ${org}/${repo}`);
} else if (userArg) {
	console.warn(
		`Ignoring invalid argument '${userArg}'. Expected format: org/repo`,
	);
}

const GITHUB_API_URL = `https://api.github.com/repos/${org}/${repo}/contents/${RULES_PATH}`;
const DEST_DIR_NAME = RULES_PATH; // Relative to current working directory

// Helper function to make an HTTPS GET request and parse JSON response
function httpsGetJson(url) {
	return new Promise((resolve, reject) => {
		const options = {
			headers: {
				"User-Agent":
					"get-rules-npm-script/1.0.0 (github.com/johnlindquist/get-rules)",
			},
		};
		https
			.get(url, options, (res) => {
				if (res.statusCode < 200 || res.statusCode >= 300) {
					return reject(
						new Error(
							`GitHub API request failed: ${res.statusCode} for ${url}`,
						),
					);
				}
				let rawData = "";
				res.on("data", (chunk) => (rawData += chunk));
				res.on("end", () => {
					try {
						resolve(JSON.parse(rawData));
					} catch (e) {
						reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
					}
				});
			})
			.on("error", (err) => {
				reject(new Error(`HTTPS request error for ${url}: ${err.message}`));
			});
	});
}

// Helper function to download a file
function downloadFile(fileUrl, destinationPath) {
	return new Promise((resolve, reject) => {
		const fileStream = fs.createWriteStream(destinationPath);
		const options = {
			headers: {
				"User-Agent":
					"get-rules-npm-script/1.0.0 (github.com/johnlindquist/get-rules)",
			},
		};
		https
			.get(fileUrl, options, (response) => {
				if (response.statusCode < 200 || response.statusCode >= 300) {
					fs.unlink(destinationPath, () => {}); // Clean up empty file on error
					return reject(
						new Error(
							`Failed to download ${fileUrl}. Status: ${response.statusCode}`,
						),
					);
				}
				response.pipe(fileStream);
				fileStream.on("finish", () => {
					fileStream.close(resolve);
				});
			})
			.on("error", (err) => {
				fs.unlink(destinationPath, () => {}); // Clean up if error occurs
				reject(new Error(`Error downloading ${fileUrl}: ${err.message}`));
			});
	});
}

// Recursive function to download all files from a directory
async function downloadDirectory(apiUrl, localPath, basePath = "") {
	try {
		const contents = await httpsGetJson(apiUrl);
		
		if (!Array.isArray(contents)) {
			console.error(`Error: Expected array from ${apiUrl}, got:`, contents);
			return;
		}

		for (const item of contents) {
			const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
			const localItemPath = path.join(localPath, item.name);

			if (item.type === "dir") {
				// Create directory locally
				if (!fs.existsSync(localItemPath)) {
					fs.mkdirSync(localItemPath, { recursive: true });
					console.log(`  - Created directory: ${itemPath}`);
				}
				// Recursively download directory contents
				await downloadDirectory(item.url, localItemPath, itemPath);
			} else if (item.type === "file" && item.name.endsWith(".mdc")) {
				// Download .mdc files
				if (item.download_url) {
					if (fs.existsSync(localItemPath)) {
						// Move existing file to temp
						const tempDir = os.tmpdir();
						const tempFilePath = path.join(tempDir, `${item.name}.${Date.now()}`);
						fs.renameSync(localItemPath, tempFilePath);
						console.log(`  - ${itemPath} existed, moved to temp: ${tempFilePath}`);
					}
					console.log(`  - Downloading ${itemPath}...`);
					try {
						await downloadFile(item.download_url, localItemPath);
					} catch (downloadError) {
						console.error(`    Failed to download ${itemPath}: ${downloadError.message}`);
					}
				}
			}
		}
	} catch (error) {
		console.error(`Error processing directory ${apiUrl}: ${error.message}`);
	}
}

async function main() {
	const absoluteDestDir = path.resolve(process.cwd(), DEST_DIR_NAME);
	console.log(`Attempting to install rules to ${absoluteDestDir}`);

	try {
		// 1. Ensure destination directory exists
		if (!fs.existsSync(absoluteDestDir)) {
			fs.mkdirSync(absoluteDestDir, { recursive: true });
			console.log(`Created directory: ${absoluteDestDir}`);
		} else {
			console.log(`Directory ${absoluteDestDir} already exists.`);
		}

		// 2. Download all .mdc files recursively from the rules directory
		console.log(
			`Fetching rules from GitHub (${org}/${repo})...`,
		);
		
		await downloadDirectory(GITHUB_API_URL, absoluteDestDir);

		console.log("\n✅ Rules update process finished.");
	} catch (error) {
		console.error("\n❌ An error occurred during the rules download process:");
		console.error(error.message);
		process.exit(1);
	}
}

main();
