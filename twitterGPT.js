// twitterGPT: Browses Twitter and summarizes using ChatGPT 
const puppeteer = require("puppeteer");
const path = require('node:path');
const fs = require('fs');
const CHATGPT_MAX_CHARS = 3250;
const MIN_WORDS_PER_TWEET = 4;
const WAIT_MS = 1000;

// utils
const hasEmoji = (text) => (text.match(/\p{Emoji}/gu) || []).length > 0
const urlRegex = /https:\/\/t.co\/[a-zA-Z0-9]+/gm;
const wait = (ms) => new Promise(res => setTimeout(res, ms));
const countWords = (str) => str.split(" ").length;
const countChars = (str) => str.length;

(async () => {
    var tweets = []
    var onlyText = []
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
        userDataDir: path.resolve(__dirname, "/Users/pablo/programming/chromedir"),
        args: [`--window-size=900,800`],
        defaultViewport: { width: 900, height: 800 }
    });
    const page = await browser.pages().then((pages) => pages[0])
    const client = await page.target().createCDPSession();
    await client.send('Fetch.enable', { patterns: [{ "urlPattern": '*HomeTimeline*', "requestStage": "Response" }, { "urlPattern": '*HomeLatestTimeline*', "requestStage": "Response" }] });
    await page.goto("https://www.twitter.com")
    client.on('Fetch.requestPaused', async ({ requestId }) => {
        const response = await client.send("Fetch.getResponseBody", { requestId })
        const payload = JSON.parse(Buffer.from(response.body, 'base64').toString())
        const entries = payload.data.home.home_timeline_urt.instructions[0].entries
        for (let i = 0; i < entries.length; i++) {
            try {
                let txt = entries[i].content.itemContent.tweet_results.result.legacy.full_text
                    .replace(urlRegex, '')
                    .replace('\n', '')
                    .replace(':', '')
                let author = entries[i].content.itemContent.tweet_results.result.core.user_results.result.legacy.screen_name
                if (!txt.startsWith('RT @')
                    && (!hasEmoji(txt))
                    && (entries[i].entryId.startsWith('tweet'))
                    && (countWords(txt) > MIN_WORDS_PER_TWEET)) {
                    tweets.push(author + ': ' + txt)
                    onlyText.push(txt)
                }
            } catch (e) { }
        }
        await client.send("Fetch.continueRequest", { requestId })
    })
    console.log('\nBrowsing Twitter')
    await page.waitForSelector('div[aria-label="Home timeline"]')
    await wait(WAIT_MS);
    const scrollDown = async (page) => { await page.evaluate(async () => { await new Promise((resolve,) => { let distance = 7000; window.scrollBy(0, distance); resolve() }); }); };
    for (i = 0; i < 9; i++) {
        await wait(WAIT_MS);
        await scrollDown(page);
    }
    await wait(WAIT_MS)
    if (tweets.length > 0) {
        console.log('\nTweets fetched: ', tweets.length, '\n\nHead:')
        for (let i = 0; i < 10; i++) {
            try {
                if (tweets[i].length > 70) {
                    console.log(i + 1 + '. ' + tweets[i].slice(0, 70) + ' ...')
                } else { console.log(i + 1 + '. ' + tweets[i]) }
            }
            catch (e) { }
        }
        var tweetList = [];
        var chars = 0;
        var prompt = fs.readFileSync('./prompt.txt', 'utf-8')
        for (let i = 0; i < onlyText.length; i++) {
            if (chars + onlyText[i].length < CHATGPT_MAX_CHARS - countChars(prompt)) {
                tweetList.push(onlyText[i]);
                chars += onlyText[i].length;
            } else { break; }
        }
        console.log('\nPrompting ChatGPT with tweets.\n')
        prompt = prompt.replace(/<<TWEETS>>/g, JSON.stringify(tweetList))
        await page.goto("https://chat.openai.com/chat")
        await page.waitForSelector('textarea[data-id="root"]')
        await page.click('textarea[data-id="root"]')
        await page.type('textarea[data-id="root"]', prompt, 1)
        await page.keyboard.press('Enter')
        await scrollDown(page)
        await wait(WAIT_MS*40)
        browser.close()
    }
})();
