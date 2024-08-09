# Sekai Merger
Silly script that can generate standalone or merged project sekai chart compatible with [Burrito's engine](https://github.com/NonSpicyBurrito/sonolus-pjsekai-engine) or [Nanashi's engine](https://github.com/sevenc-nanashi/sonolus-pjsekai-engine-extended)
## Build
Clone the repository then run
``` bash
npm install
npm run build
```
### External Dependencies
This project rely on [FFmpeg](https://www.ffmpeg.org) to work with audio.
Please [download](https://www.ffmpeg.org/download.html), install and add it to your enviroment.
## Usage

``` bash
# basic usage
# merge expert chart of id 1, 2, 3
node ./build/sekai-merger.js expert 1 2 3

# prefer sekai version of a song
node ./build/sekai-merger.js master 80 88 --prefer=sekai

# output as usc
node ./build/sekai-merger.js append 388 --out=cc_usc

# print help for more information
node ./build/sekai-merger.js -help
```

<sub>For more information about level id use [Sekai Viewer](https://sekai.best/music).</sub>