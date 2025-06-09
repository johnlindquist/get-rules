#!/usr/bin/env node

const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const chalk = require("chalk");
const prompts = require("prompts");

const DEFAULT_ORG = "johnlindquist";
const DEFAULT_REPO = "get-rules";
const CURSOR_PATH = ".cursor";

// Display welcome message and instructions
function displayWelcome() {
	console.log();
	console.log(chalk.cyan.bold("🚀 Welcome to get-rules!"));
	console.log(chalk.gray("═".repeat(60)));
	console.log();
	console.log(
		"This tool downloads the .cursor directory from a GitHub repository.",
	);
	console.log(`Files will be downloaded to: ${chalk.yellow(".cursor/")}`);
	console.log(
		chalk.dim("All files inside the .cursor directory will be downloaded."),
	);
	console.log();
	console.log(chalk.dim("You can:"));
	console.log(
		chalk.dim("  • Use the default repository (johnlindquist/get-rules)"),
	);
	console.log(
		chalk.dim("  • Specify your own repository in the format: org/repo"),
	);
	console.log(
		chalk.dim("  • Pass the repo as an argument: get-rules org/repo"),
	);
	console.log();
	console.log(chalk.gray("═".repeat(60)));
	console.log();
}

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
				res.on("data", (chunk) => {
					rawData += chunk;
				});
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
async function downloadDirectory(
	apiUrl,
	localPath,
	basePath = "",
	stats = { downloaded: 0, errors: 0, moved: 0 },
) {
	try {
		const contents = await httpsGetJson(apiUrl);

		if (!Array.isArray(contents)) {
			console.error(
				chalk.red(`Error: Expected array from ${apiUrl}, got:`, contents),
			);
			return;
		}

		for (const item of contents) {
			const itemPath = basePath ? `${basePath}/${item.name}` : item.name;
			const localItemPath = path.join(localPath, item.name);

			if (item.type === "dir") {
				// Create directory locally
				if (!fs.existsSync(localItemPath)) {
					fs.mkdirSync(localItemPath, { recursive: true });
					console.log(chalk.dim(`  📁 Created directory: ${itemPath}`));
				}
				// Recursively download directory contents
				await downloadDirectory(item.url, localItemPath, itemPath, stats);
			} else if (item.type === "file") {
				// Download any file now
				if (item.download_url) {
					if (fs.existsSync(localItemPath)) {
						// Move existing file to temp
						const tempDir = os.tmpdir();
						const tempFilePath = path.join(
							tempDir,
							`${item.name}.${Date.now()}`,
						);
						fs.renameSync(localItemPath, tempFilePath);
						console.log(chalk.dim(`  ↻ ${itemPath} existed, moved to temp`));
						stats.moved++;
					}
					try {
						await downloadFile(item.download_url, localItemPath);
						console.log(chalk.green(`  ✓ Downloaded ${itemPath}`));
						stats.downloaded++;
					} catch (downloadError) {
						console.error(
							chalk.red(
								`  ✗ Failed to download ${itemPath}: ${downloadError.message}`,
							),
						);
						stats.errors++;
					}
				}
			}
		}
	} catch (error) {
		console.error(
			chalk.red(`Error processing directory ${apiUrl}: ${error.message}`),
		);
		stats.errors++;
	}
	return stats;
}

async function main() {
	// Dynamically import ora (ESM module)
	const { default: ora } = await import("ora");

	let org;
	let repo;

	// Check if argument was provided
	const userArg = process.argv[2];

	if (userArg && /^[^/]+\/[^/]+$/.test(userArg)) {
		// Valid argument provided, use it directly
		[org, repo] = userArg.split("/");
		console.log(chalk.cyan(`\nUsing repository: ${org}/${repo}`));
	} else if (userArg) {
		// Invalid argument provided
		console.warn(
			chalk.yellow(
				`\n⚠️  Invalid argument '${userArg}'. Expected format: org/repo`,
			),
		);
		console.log("Proceeding with interactive mode...\n");
	}

	// If no valid argument, show interactive prompt
	if (!org || !repo) {
		displayWelcome();

		const response = await prompts({
			type: "text",
			name: "repository",
			message: "Enter GitHub repository",
			initial: `${DEFAULT_ORG}/${DEFAULT_REPO}`,
			validate: (value) =>
				/^[^/]+\/[^/]+$/.test(value) || "Invalid format. Expected: org/repo",
		});

		if (!response.repository) {
			console.log(chalk.yellow("\n⚠️  Operation cancelled"));
			process.exit(0);
		}

		[org, repo] = response.repository.split("/");
		console.log(chalk.cyan(`\n✓ Using repository: ${org}/${repo}`));
	}

	// Construct the API URL with the selected repo
	const GITHUB_API_URL = `https://api.github.com/repos/${org}/${repo}/contents/${CURSOR_PATH}`;
	const absoluteDestDir = path.resolve(process.cwd(), CURSOR_PATH);

	console.log(
		chalk.dim(`\n📁 Files will be downloaded to: ${absoluteDestDir}`),
	);
	console.log(chalk.gray("─".repeat(60)));

	const spinner = ora({
		text: `Fetching rules from GitHub (${org}/${repo})...`,
		color: "cyan",
	}).start();

	try {
		// 1. Ensure destination directory exists
		if (!fs.existsSync(absoluteDestDir)) {
			fs.mkdirSync(absoluteDestDir, { recursive: true });
			spinner.info(`Created directory: ${absoluteDestDir}`);
			spinner.start("Downloading rules...");
		} else {
			spinner.text = "Downloading rules...";
		}

		// 2. Download all .mdc files recursively from the rules directory
		console.log(); // New line for better formatting
		const stats = await downloadDirectory(GITHUB_API_URL, absoluteDestDir);

		spinner.stop();
		console.log(); // New line before summary

		// Show summary
		console.log(chalk.green.bold("✅ Download completed!"));
		console.log();
		console.log(chalk.cyan("📊 Summary:"));
		console.log(`   • Downloaded: ${chalk.green(stats.downloaded)} files`);
		if (stats.moved > 0) {
			console.log(
				`   • Updated: ${chalk.yellow(
					stats.moved,
				)} files (old versions moved to temp)`,
			);
		}
		if (stats.errors > 0) {
			console.log(`   • Errors: ${chalk.red(stats.errors)} files`);
		}

		console.log();
		console.log(
			chalk.dim("💡 Tip: To use your own repository, create one with a"),
		);
		console.log(
			chalk.dim(`   ${chalk.yellow(".cursor/")} directory at its root.`),
		);
	} catch (error) {
		spinner.fail("Download failed");
		console.error(
			chalk.red("\n❌ An error occurred during the download process:"),
		);
		console.error(chalk.red(error.message));
		console.error(chalk.dim("\nPlease check that:"));
		console.error(chalk.dim("  • The repository exists and is public"));
		console.error(
			chalk.dim("  • The repository contains a .cursor/ directory"),
		);
		console.error(chalk.dim("  • You have internet connectivity"));
		process.exit(1);
	}
}

// Handle errors gracefully
process.on("unhandledRejection", (error) => {
	console.error(chalk.red("\n❌ Unexpected error:"), error.message);
	process.exit(1);
});

main();
