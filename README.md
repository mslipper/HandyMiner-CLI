HANDYMINER
2019 Alex Smith <alex.smith@earthlab.tech>

A simple wrapper for cBlake OpenCL Miner
to communicate with Handshake HSD via Stratum (hstratum)

```
       _.-._        _.-._
     _| | | |      | | | |_
    | | | | |      | | | | |
    | | | | |      | | | | |
    | _.-'  | _  _ |  '-._ |
    ;_.-'.-'/`/  \`\`-.'-._;
    |   '    /    \    '   |
     \  '.  /      \  .`  /
      |    |        |    |

```

EPIC Thanks to chjj and the entire Handshake Project

EPIC Thanks to the Handshake Alliance for being a solid team

EPIC Thanks to Steven McKie for being my mentor/believing in me

# MINER SETUP GUIDE

## Prerequisites:
0. **OpenCL support for AMD or NVIDIA GPUs**

    Windows/Mac: Built-in, you can skip this.

    Linux: try adding the following packages in apt:
    ```
    sudo add-apt-repository ppa:graphics-drivers

    NVIDIA:
    nvidia-compute-utils-[latest]
    nvidia-utils-[latest]
    nvidia-driver-[latest]
    nvidia-cuda-toolkit


    AMD
    //download the drivers (.run file) from AMD.
    amdgpu-pro-install --opencl=pal,legacy --headless //--opencl=rocm for >vega cards
    //there is a nice rocm-* packages in apt lately for >= vega cards. It doesnt like RX**0 cards tho.
    ```

1. (Windows Only) **A 64-bit terminal of your choice**:
    - [Git Bash](https://git-scm.com/downloads)
    - [mingw-64 8.1.0 with gcc aka "MinGW-W64-install.exe"](https://sourceforge.net/projects/mingw-w64/files/Toolchains%20targetting%20Win32/Personal%20Builds/mingw-builds/8.1.0/threads-posix/dwarf/)

2. **[node.js](https://nodejs.org) v10.4 - v11+-ish (whatever one has bigint support)**

  Mac/Windows: use the link ^

  Ubuntu:
  ```
  curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
  sudo apt-get install -y nodejs
  sudo apt-get install node-gyp
  ```

3. **Install platform specific dependencies of hsd/support libraries**

  LINUX: ```sudo apt install libunbound-dev```

  MAC: ```brew install libunbound-dev```

  WINDOWS: HSD Install guide is below. You should use docker to run an hsd node.

4. **```npm install``` in this directory.** (windows will throw some nasty looking warnings but still complete)

5. (optional for solo miners running HSD nodes) **You will need to install an [hstratum](https://github.com/HandshakeAlliance/hstratum)-enabled [HSD](https://github.com/handshake-org/hsd)**
```
git clone https://github.com/handshake-org/hsd.git
cd hsd
npm install --production
npm install github:HandshakeAlliance/hstratum
```

6. (optional for solo miners running HSD nodes) **Running HSD::**


```
./bin/hsd --network=testnet --cors=true --api-key=earthlab --http-host=0.0.0.0 --coinbase-address=ts1q59rxjegn030vwe0z3jjgx76j6ql44tpfwkjv5g --listen --plugins hstratum --stratum-host 0.0.0.0 --stratum-port 3008 --stratum-public-host 0.0.0.0 --stratum-public-port 3008 --stratum-max-inbound 1000 --stratum-difficulty 8 --stratum-dynamic --stratum-password=earthlab
```

^^ Notice the --coinbase-address field: that's your wallet you'd like to mine to. You really only need to change that to run HSD. Also try adding --daemon later

Note the 'stratum-password' (change to whatever you like). We use this in the miner configuration next


## MINER CONFIGURATION

First we should setup our configuration. Note: The default config will list gpus out of the box if you run ```npm start```
**config.json format**
```
{
  "gpus":"1", //pass in "-1" here to list your available GPU's/the # you want, prob "1" for single cards/laptops
  "gpu_platform":"0", //probably 0 for mac or laptops, my windows 10 rig was "1"
  "gpu_mfg":"AMD", //AMD||NVIDIA
  "intensity":10, //intensity 1 - 10. Try 11 for >=8GB cards for an extra boost
  "host":"127.0.0.1", //hsd stratum host
  "port":"3008", //hsd stratum port
  "stratum_user":"myRigName", your rig name in the stratum
  "stratum_pass":"theStratumPassword", //stratum password you started hsd with
  "wallet":"ts1q59rxjegn030vwe0z3jjgx76j6ql44tpfwkjv5g", //optional, for pool stratum mining only: your wallet
  "muteWinningFanfare":true, //optional, set to true to turn off the awesome block submission fanfare song.
  "mode":"solo",//required MINING MODE: solo || pool. Use pool to mine to a pool
  "poolDifficulty":10 //pool difficulty. Try to shoot for 20-30 second share times. If you put this too low it will block you.
}
```

The GPU ID's are a comma separated string of GPU ID integers, aka ```"1,2,3"```.
In addition, we can passin multiple GPU's from multiple platforms and vendors!!1!
So if platform #1 on my rig has my AMD cards on GPU 0 and GPU 1, while my nvidia cards show up on platform #0 as GPU 1 and GPU 2.
So in my configuration I'd just add a comma separated value for all platform and manufacturer fields. If they are all the same you can just use 1 as well...
```
{
  "gpus":"0,1,1,2"
  "gpu_platform":"1,1,0,0"
  "gpu_mfg":"amd","amd","nvidia","nvidia",
  "intensity":"10,5,11,11",
  ...

}
```
Likely they are the same ones you mine with on your rig config elsewhere. If you don't know, pass in "-1" into "gpus" and the log will list the possible GPU's for a single platform listed in 'gpu_platform'. GPU Platform is probably "0" on most laptops/single card machines. On my Windows rig it's "1". Passing in "-1" in the gpus field with a single platform in 'gpu_platform' will answer for you.



## THE POINT

You can now launch the miner with:
```
cd (into this directory)
npm start
```
Mine blocks!




### Windows HSD installation::

HSD doesnt install right on windows at the moment. Not to worry, we'll use docker for now..

0. Download docker
1. You can use the Dockerfile in windows_utils/Dockerfile to build a suitable machine with hsd/hstratum configured. The command to build from that Dockerfile is
```
cd ./windows_utils
docker build -t someImageName .
```
2. To run that docker image:
```
docker run -p 13037:13037 -p 13038:13038 -p 3008:3008 --expose 3008 --name someContainerName -td someImageName
```
3. Once you have built the image you can now get into the bash terminal and run HSD!
```
docker ps -a //to check all machines to see if ours is running. if you set --name, then you can use the name here like docker start myName
If it's not running, just run:

docker start 26137f087795
//or if you set --name in 2:
docker start someContainerName
```
where 26137f087795 is the ID of the machine i want to start. After it's started you can now "ssh" in with docker like (windows first) :
```
winpty docker exec -it 26137f087795 bash
//OR just
docker exec -it 26137f087795 bash
//also you can replace 26137f087795 with someContainerName you set above
```
winpty is some plugin for some 64 bit terminals like git bash, minty, cygwin, etc.

Once you get into the Docker machine, hsd (preinstalled with hstratum) is found in ```/usr/hsd``` and can be run with the commands starting at #2 in the Mac/*n*x section above.

After HSD is running on your Docker container you can now fire up the miner! Back in Windows land, cd into this directory and you can run:

```
//first time we run::
npm install --global --production windows-build-tools
npm install
//after that, to start all we need is:
npm start
```

### Possible Windows Gotchas
If a terminal like Git Bash is throwing errors/problems, try using MinGW-64::
Go [download mingw-64 8.1.0 with gcc aka "MinGW-W64-install.exe"](https://sourceforge.net/projects/mingw-w64/files/Toolchains%20targetting%20Win32/Personal%20Builds/mingw-builds/8.1.0/threads-posix/dwarf/) and have it either installed in
```"C:\Program Files\mingw-w64\x86_64-8.1.0-posix-seh-rt_v6-rev0"```
OR feel free to change the line in miner/HandyMiner.js to reflect where your mingw64 binaries are located like::
```
envVars.PATH = "C:\\Program\ Files\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\bin"+';'+process.env.PATH;

just change the directory part that's "C:\\Program\ Files\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\bin" which should only be some verion difference (aka: "x86_64-8.1.0-posix-seh-rt_v6-rev0") if any. Future reference: This will get bundled in/automated..

```

## Troubleshooting

### Linux

If you get an error like "couldn't find platform," this means that your GPU drivers are not installed. Try running the driver installation script again. Make sure to reboot after installation.
