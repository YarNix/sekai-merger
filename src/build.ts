// Ignore my attempt to build to binary
// import { execSync } from "child_process";
// import { copyFileSync, renameSync } from "fs";
// import path from "path";
// execSync("node --experimental-sea-config sea-config.json");
// const binaryPath = path.join('build', 'sekai-merge' + path.extname(process.execPath));
// copyFileSync(process.execPath, binaryPath);
// execSync(`npx postject ${binaryPath} NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, { stdio: 'inherit' });
// renameSync(binaryPath, path.basename(binaryPath));