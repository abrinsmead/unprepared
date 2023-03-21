# Installation
```
npm install -g unprepared
```

Configure your OpenAI API key in your environment.
```
OPENAI_API_KEY=<your secret api key>
```

# Usage
``` 
Usage: unprepared <topic...> --model=gpt-4 --images --debug

Arguments:
  topic            The presentation topic that you were unprepared for.

Options:
  --model [model]  OpenAI model compatible with createChatCompletion() interface. (default: "gpt-3.5-turbo")
  --images         Include Dall-e AI images. (default: false)
  --debug          Debug mode. (default: false)
  -h, --help       display help for command
```

# Presentation Usage

A stand-alone html file is writted to `./presentation/presentation.html`

Press `f` for fullscreen mode.

Use arrow keys to navigate slides.


# Examples

```
$ unprepared using async/await in javascript 
```

```
$ unprepared ancient roman plumbing --images 
```

```
$ unprepared acid house --images --model=gpt-4 
```

# To Do
* Download Dall-e images before they expire 
* Fix LaTex formatting for single dollar delimited formulas
