
const { readFileSync } = require("fs");
const { launch } = require("puppeteer");
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');


/**
 * @typedef Options
 * @type {object}
 * @property {string} background - the background color of the video.
 * @property {number} fps - the number of frames per second.
 * @property {number} duration - the duration of the video in seconds.
 * @property {number} width - the width of the video.
 * @property {number} height - the height of the video.
 * @property {number} quality - the quality of the video.
 * @property {string} executablePath - the path to the puppeteer executable.
 */


/**
 * Converts an SVG to a video.
 * @param {string} svgPath - the path to the SVG file.
 * @param {string} videoPath - the path to the video file.
 * @param {Options} options - the options.
 * @returns {Promise<void>}
 */
async function svgToVideo(svgPath, videoPath, options = {}) {
    const svg = readFileSync(svgPath, 'utf8');
    const background = options.background || "black";
    const fps = options.fps || 24;
    const quality = options.quality || 100;
    const pageWidth = options.width || Math.floor(parseFloat(svg.match(/width="([\d\.]+)"/)[1]));
    const pageHeight = options.height || Math.floor(parseFloat(svg.match(/height="([\d\.]+)"/)[1]));
    const duration = (options.duration || Math.floor(parseFloat(svg.match(/animation-duration:([\d\.]+)s/)[1]))) * 1000;

    let puppeteerLaunchOptions = {
        defaultViewport: {
            width: pageWidth,
            height: pageHeight,
        },
        executablePath: options.executablePath,
        headless: "new",
        args: [
            '--no-sandbox',
        ],
    }
    let puppeteerScreenRecorderOptions = {
        fps: fps,
        quality: quality,
    }

    // launch a new browser
    const browser = await launch(puppeteerLaunchOptions);

    // create a new page
    const page = await browser.newPage();
    page.on('console', msg => console.log(msg.text()));
    page.on('pageerror', err => console.log(err));
    page.on('error', err => console.log(err));

    // load the svg
    const recorder = new PuppeteerScreenRecorder(page, puppeteerScreenRecorderOptions);
    let html = `
        <html>
            <head>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        background: ${background};
                    }
                </style>
            </head>
            <body>
                ${svg}
            </body>
        </html>
    `;
    html = html.replace("animation-iteration-count:infinite", "animation-iteration-count:0");
    await page.setContent(html);

    // start recording
    await recorder.start(videoPath);
   
    html = html.replace("animation-iteration-count:0", "animation-iteration-count:1");
    await page.setContent(html);

    // wait for the animation to finish
    await wait(duration);
    await recorder.stop();

    // close the browser
    await page.close()
    await browser.close()
}

/**
 * Waits for a given amount of time.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

module.exports = {
    svgToVideo,
};
