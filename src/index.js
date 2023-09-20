
const { readFileSync, rmdirSync, mkdirSync } = require("fs");
const { launch } = require("puppeteer");
const { PassThrough } = require('stream');
const PuppeteerMassScreenshots = require('puppeteer-mass-screenshots');
const ffmpeg = require('fluent-ffmpeg');

/**
 * @typedef Options
 * @type {object}
 * @property {string} background - the background color of the video.
 * @property {number} fps - the number of frames per second.
 * @property {number} duration - the duration of the video in seconds.
 * @property {number} width - the width of the video.
 * @property {number} height - the height of the video.
 * @property {string} executablePath - the path to the puppeteer executable.
 * @property {number} delayStart - the delay before the animation starts in seconds.
 * @property {boolean} headless - whether to run in headless mode.
 */

/**
 * Converts an SVG to a video.
 * @param {string} svgPath - the path to the SVG file.
 * @param {string} videoPath - the path to the video file.
 * @param {Options} options - the options.
 * @returns {Promise<void>}
 */
async function svgToVideo(svgPath, videoPath, options = {}) {
    const background = options.background || "black";
    const fps = options.fps || 25;
    const delayStart = (options.delayStart || 0) * 1000;
    const headless = options.headless || false;
    const executablePath = options.executablePath || null;
    let svg = readFileSync(svgPath, 'utf8');

    let puppeteerLaunchOptions = {
        executablePath: executablePath,
        headless: headless ? "new" : false,
    }


    // launch a new browser
    console.log("Launching browser", puppeteerLaunchOptions)
    const browser = await launch(puppeteerLaunchOptions);

    // create a new page
    const page = await browser.newPage();
    page.on('console', msg => console.log(msg.text()));
    page.on('pageerror', err => console.log(err));
    page.on('error', err => console.log(err));

    // Stop all animations
    svg = svg.replace(/animation-iteration-count: ?([\d\.]+|infinite)/, "animation-iteration-count: 0");
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

    await page.setContent(html);

    let svgWidth = options.width || 0
    if (!svgWidth) {
        svgWidth = await page.evaluate(() => {
            let svg = document.querySelector("svg");
            return Math.floor(parseFloat(svg.getAttribute("width")));
        })
        console.log("detected width", svgWidth, "px")
    }

    let svgHeight = options.height || 0
    if (!svgHeight) {
        svgHeight = await page.evaluate(() => {
            let svg = document.querySelector("svg");
            return Math.floor(parseFloat(svg.getAttribute("height")));
        })
        console.log("detected height:", svgHeight, "px")
    }

    // expose functions
    await page.exposeFunction("parseDuration", parseDuration);
    await page.exposeFunction("getAnimationDuration", getAnimationDuration);

    // get the duration
    let duration = (options.duration || 0) * 1000;
    if (!duration) {
        duration = await page.evaluate(async () => {
            let maxDuration = 0;
            let elements = document.querySelectorAll("*");
            for (let element of elements) {
                if (element.style.cssText) {
                    let duration = await getAnimationDuration(element.style.cssText);
                    if (duration > maxDuration) {
                        maxDuration = duration;
                    }
                }
            }
            return maxDuration
        })
        duration = Math.ceil(duration)
        console.log("detected duration", duration, "ms")
    }

    // set the viewport
    await page.setViewport({
        width: svgWidth,
        height: svgHeight
    })


    if (delayStart > 0) {
        console.log("Delaying", delayStart, "ms")
        await wait(delayStart);
        // Reload the page to reset the animation
        await page.setContent(html);
    }

    let imagesAndTimeoffsets = [];
    // start recording
    const tmpDir = videoPath + ".tmp"
    mkdirSync(tmpDir, { recursive: true });

    const screenshots = new PuppeteerMassScreenshots();
    await screenshots.init(page, tmpDir, {
        afterWritingImageFile: (filename) => {
            let now = Date.now()
            if (imagesAndTimeoffsets.length > 0) {
                imagesAndTimeoffsets[imagesAndTimeoffsets.length - 1].timeoffset = now - imagesAndTimeoffsets[imagesAndTimeoffsets.length - 1].time
            }
            imagesAndTimeoffsets.push({
                filename: filename,
                time: now,
                timeoffset: 0,
            })
        }
    });


    await screenshots.start(options);
    await page.evaluate(() => {
        let elements = document.querySelectorAll("*");
        for (let element of elements) {
            if (element.style.cssText) {
                element.style.cssText = element.style.cssText.replace("animation-iteration-count: 0", "animation-iteration-count: 1");
            }
        }
    })

    // wait for the animation to finish
    console.log("Waiting", duration, "ms")
    await wait(duration);

    // stop recording
    console.log("Stop recording")
    await screenshots.stop();
    await page.close();
    await browser.close();

    // Combine images to video
    console.log("Combining images to video")
    let videoMediatorStream = new PassThrough();
    let toVideoWorker = pipeToVideo(videoMediatorStream, videoPath, fps)

    for (let { filename, timeoffset } of imagesAndTimeoffsets) {
        let times = Math.ceil(timeoffset * fps /1000.0) + 1
        console.log("Writing image", filename, "duration", timeoffset, "times", times)
        let pngFilename = filename + ".png"
        await jpegToPng(filename, pngFilename);
        let imageStream = readFileSync(pngFilename);

        for (let i = 0; i < times; i++) {
            videoMediatorStream.write(imageStream);
        }
    }
    videoMediatorStream.end()

    await toVideoWorker;

    // Delete tmp dir
    console.log("Cleaning up")
    rmdirSync(tmpDir, { recursive: true });
    
    console.log("Done")
}

/**
 * Waits for a given amount of time.
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function wait(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}

/**
 * Converts jpeg to png.
 * @param {string} jpegFilename
 * @param {string} pngFilename
 * @returns {Promise<void>}
 */
function jpegToPng(jpegFilename, pngFilename) {
    return new Promise((resolve, reject) => {
        ffmpeg(jpegFilename).
            outputOptions('-c:v', 'png').
            output(pngFilename).
            on('end', resolve).
            on('error', reject).
            run();
    });
}

/** 
 * pipe to video
 * @param {PassThrough} videoMediatorStream
 * @param {string} videoPath
 * @param {number} fps
 * @returns {Promise<void>}
 */
function pipeToVideo(videoMediatorStream, videoPath, fps) {
    return new Promise((resolve, reject) => {
        let outputStream = ffmpeg({
            source: videoMediatorStream,
        })
            .inputFPS(fps)
            .inputOptions('-c:v', 'png')
            .inputFormat('image2pipe')
            .saveToFile(videoPath)
            .on('error', (e) => {
                console.log("ffmpeg error", e)
                resolve(false)
            })
            .on('end', () => {
                console.log("ffmpeg end")
                resolve(true)
            })
        console.log("ffmpeg started")
        outputStream.run();
    });
}
    
/**
 * Parses a duration string.
 * @param {string} duration
 * @returns {number} milliseconds
 */
function parseDuration(duration) {
    let match = duration.match(/([\d\.]+)(s|ms)/);
    if (!match) {
        throw new Error(`Invalid duration: ${duration}`);
    }
    let value = parseFloat(match[1]);
    let unit = match[2];
    if (unit === "s") {
        return value * 1000;
    } else if (unit === "ms") {
        return value;
    }
    throw new Error(`Invalid duration: ${duration}`);
}


/**
 * Get animation duration from cssText
 * @param {string} cssText
 * @returns {number} milliseconds
 */
function getAnimationDuration(cssText) {
    let match = cssText.match(/animation-duration: ?([\d\.]+s|[\d\.]+ms)/);
    if (!match) {
        return 0;
    }
    return parseDuration(match[1]);
}

module.exports = {
    svgToVideo,
};
