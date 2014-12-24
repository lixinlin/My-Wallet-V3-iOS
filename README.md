# My-Wallet-iPhone-HD


# Building

## Setup git submodules

_ssh pub key has to be registered with Github for this to work_

    git submodule update --init
    cd Submodules/My-Wallet-HD
    git checkout master
    npm install
    cd ../OpenSSL-for-iPhone  
    git checkout master
    ./build-libssl.sh

## Open the project in Xcode

    cd ../../
    open Blockchain.xcodeproj

## Build the project

    cmd-r


## License

Source Code License: LGPL v3

Artwork & images remain Copyright Ben Reeves - Qkos Services Ltd 2012-2014