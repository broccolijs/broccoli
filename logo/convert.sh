#!/bin/bash

# Generate broccoli-logo-small.generated.png for avatars
convert broccoli-logo.png -trim -resize 500x500 -background none -gravity center -extent 550x550 -colors 256 +dither -strip broccoli-logo-small.generated.png
