#!/usr/bin/env node

const fs = require('fs').promises
const { fs: fs2 } = require('module');
const { exec } = require('node:child_process')
const os = require('os')
const path = require('node:path')
const { URL } = require('url');

const Axios = require('axios')
const appRoot = require('app-root-path')
const Spinner = require('cli-spinner').Spinner;
require('dotenv').config()
const { program } = require('commander')
const Mustache = require('mustache')
const { Configuration, OpenAIApi } = require("openai")

program
  .usage('<topic...> --model=gpt-4 --images --debug')
  .argument('<topic...>', 'The presentation topic that you were unprepared for.')
  .option('--model [model]', 'OpenAI model compatible with createChatCompletion() interface.', 'gpt-3.5-turbo')
  .option('--images', 'Include Dall-e AI images.', false)
  .option('--debug', 'Debug mode.', false)

program.parse(process.argv)

const model = program.opts().model
const topic = program.args.join(' ')
const renderImages = program.opts().images
const openai_configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
const openai = new OpenAIApi(openai_configuration)


const spinner = new Spinner({
    text: '%s',
    stream: process.stderr
})
spinner.start()

async function downloadImage(url, filepath) {
    console.log(url)
    const response = await Axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs2.createWriteStream(filepath))
            .on('error', reject)
            .once('close', () => resolve(filepath)); 
    });
}

async function generateText(prompt) {

    const systemMessage = `
YOUR ONLY PURPOSE IS TO GENERATE INFORMATIVE SLIDE PRESENTATIONS
###
PRESENTATIONS SHOULD BE COMPREHENSIVE, BUT INDIVIDUAL SLIDE CONTENT SHOULD BE BRIEF. USUALLY NO LONGER THAN 5 SENTENCES.
###
SLIDE CONTENT IN slides[].content SHOULD BE MARKDOWN FORMATED
###
IF THE TOPIC IS RELATED TO A COMPUTER LANGUAGE, FRAMEWORK, LIBRARY THEN INCLUDE CODE SAMPLES
###
USE THE LANGUAGES LINE CONTINUATION FEATURE TO MINIMIZE THE WIDTH OF CODE SAMPLE SECTIONS TO 40 CHARACTERS
WRAP MULTILINE CODE IN MARKDOWN CODE BLOCKS (EXAMPLE: \`\`\`many lines of example code...\`\`\`) 
WRAP FRAGMENTS OF CODE IN SINGLE TICK (EXAMPLE: use the \`groupBy()\' function)
DO NOT HTML ENCODE > AND < AS &gt; OR &let;
###
DO NOT PREFIX MESSAGES WITH TALK LIKE "Sure, here's a JSON response for a slide deck on..."
###
ALL RESPONSES MUST BE STRICTLY IN THE FOLOWING JSON FORMAT WITHOUT ANY TEXT PRECEDED OR FOLLOWING IT: 
###
{
    "presentationTitle": <title of presentation>,
    "backgroundColor": <hex color code approproate for the presentation content. Should display well with textColor>,
    "linearGradient": <optional, an additional ackground color that is blended with backgroundColor to make a gradient effect>,
    "textColor": <hex color code approproate for the presentation content. Should work well with backgroundColor>,
    "fontFamily": <google font family to use. should be appropriate for the presentation content.>
    "imageStyle": <instructions to the art director for the style or vibe to be used for the images that works with the topic, font color and background color.>
    "slides": [
        {
            \"title\": <slide title>,
            \"content\": <slide content rendered as markdown. code examples should be formatted as markdown code block. do not repeat the slide title in the content. do not use html encoding in code blocks. wrap code at 60 characters using the topic languages line continuation feature.>,
            \"imageDescription\": <detailed instructions for art director, illustrator or photgrapher. Images are always relavent to the slide.˚ >,
        },
        ...
    ]
}
`
    let completionRequestMessages = [{"role": "system", "content": systemMessage }]
    completionRequestMessages = completionRequestMessages.concat({role: 'user', content: `generate an informative presentation about ${prompt}`})
    try {
        const completion = await openai.createChatCompletion({
            model: model,
            'temperature': 0.2,
            messages: completionRequestMessages
        })
        return completion.data.choices[0].message.content
    } catch (error) {
        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
        process.exit()
    }
    
}

async function generateImage(prompt, style) {
    // todo: use dall-e outpainting technique for 16:9 aspect ratio
    // https://github.com/SabatinoMasala/dalle-api-outpainting-sample

    try {
        const response = await openai.createImage({
            prompt: `${prompt} in the style of ${style}`,
            n: 1,
            size: "512x512"
        })
        return response.data.data[0].url;
    } catch (error) {
        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
        process.exit()
    } 
}

async function buildPresentation(prompt) {
    let presentationResponse = await generateText(prompt)

    // extract the JSON. ChatGPT is good about not saying after the JSON, but it does sometime prefix it with some chit chat
    presentationResponse = presentationResponse.substring(presentationResponse.indexOf("{"));
    
    let presObject = JSON.parse(presentationResponse)
    let slidesObject = {}

    if (renderImages) {
        spinner.setSpinnerTitle('Generating images %s')
        slidesObject = await Promise.all(presObject.slides.map(async (slide, index)=>{
            let imageUrl = await generateImage(slide.imageDescription, presObject.imageStyle) 
            return {
                title: slide.title,
                content: slide.content,
                imageUrl: imageUrl,
                imageDescription: slide.imageDescription,
                lastSlide: (presObject.slides.length - 1 == index)
            }
        }))  
    } else {
        slidesObject = presObject.slides.map((slide, index)=>{
            return {
                title: slide.title,
                content: slide.content,
                imageUrl: null,
                imageDescription: null,
                lastSlide: (presObject.slides.length - 1 == index)
            }
        })
    }

    return {
        presentationTitle: presObject.presentationTitle, 
        renderImages: renderImages,
        textColor: presObject.textColor,
        backgroundColor: presObject.backgroundColor,
        linearGradient: presObject.linearGradient,
        fontFamily: presObject.fontFamily,
        imageStyle: presObject.imageStyle,
        slides: slidesObject,
    }
}

const downloadAndLinkImages = async (presentationObject, outputDirectoryPath) => {
    spinner.setSpinnerTitle('Downloading images %s')

    presentationObject.slides = presentationObject.slides.map(async (slide) => {

        const filename = new URL(slide.imageUrl).pathname;
        //await downloadImage(slide.imageUrl, path.join(outputDirectoryPath, filename));
        slide.localImageUrl = filename
        return slide 
    })

    return presentationObject
}

(async function main (topic) {

    spinner.setSpinnerTitle('Generating content')

    const outputDirectoryPath = 'presentation'

    let presentationObject = await buildPresentation(`generate a presentation explaining ${topic}.`)

    // if (renderImages) {
    //     spinner.setSpinnerTitle('Downloading images')
    //     presentationObject = await downloadAndLinkImages(presentationObject, outputDirectoryPath)
    // }

    if (program.opts().debug) {
        console.log(presentationObject)
    }

    spinner.setSpinnerTitle('Writing output')
    const template = await fs.readFile(appRoot + '/template.html', { encoding: 'utf8' })
    const output = Mustache.render(template, presentationObject)
    
    await fs.mkdir(`./${outputDirectoryPath}`, { recursive: true }, (err) => {
        if (err) console.error(err)
      });

    const htmlPath = path.join('./', outputDirectoryPath, 'presentation.html')
    await fs.writeFile(htmlPath, output, err => {
        if (err) console.error(err)
    });

    spinner.stop(true)

    // todo: use start for windows
    if (os.platform() === 'darwin') {
        exec('open ' + htmlPath, (err) => {
            if (err) {
                console.error('err')
            }
        })
    }
    
})(topic);
