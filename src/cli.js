#!/usr/bin/env node

const { svgToVideo } = require('./index.js');

function usage() {
    console.log(`usage: svg-to-video <svgPath> <videoPath> [options]`);
    console.log(`options:`);
    console.log(`  --background <color> (default: black)`);
    console.log(`  --fps <number> (default: 24)`);
    console.log(`  --duration <number> (default: svg duration)`);
    console.log(`  --width <number> (default: svg width)`);
    console.log(`  --height <number> (default: svg height)`);
    console.log(`  --quality <number> (default: 100)`);
    console.log(`  --executable-path <path> (default: puppeteer bundled chromium)`);
    console.log(`  --help`);
}

/**
 * this script converts an SVG to a video
 */
async function main() {
    let args = process.argv.slice(2);
    let svgPath = null;
    let videoPath = null;
    let options = {};

    for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        if (arg === '--background') {
            options.background = args[++i];
        } else if (arg === '--fps') {
            options.fps = parseInt(args[++i])
        } else if (arg === '--duration') {
            options.duration = parseInt(args[++i])
        } else if (arg === '--width') {
            options.width = parseInt(args[++i])
        } else if (arg === '--height') {
            options.height = parseInt(args[++i])
        } else if (arg === '--quality') {
            options.quality = parseInt(args[++i])
        } else if (arg === '--executable-path') {
            options.executablePath = args[++i]
        } else if (arg === '--help') {
            usage();
            process.exit(0);
            return;
        } else if (!svgPath) {
            svgPath = arg;
        } else if (!videoPath) {
            videoPath = arg;
        }
    }

    if (!svgPath || !videoPath) {
        usage();
        process.exit(1);
        return;
    }

    await svgToVideo(svgPath, videoPath, options)
    process.exit(0);
}


main()
