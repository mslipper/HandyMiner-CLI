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

**HOW TO USE::**

**Prerequisites:**
[node.js](https://nodejs.org) v10.4 - v11+-ish (whatever one has bigint support)

You will need to have access to an [hstratum](https://github.com/HandshakeAlliance/hstratum)-enabled [HSD](https://github.com/handshake-org/hsd) 


```npm install``` in this directory. 

Note: When you run the npm install we will try to install a copy of hsd in this directory. It will probably fail/complain about unbound support which is fine. We won't be running HSD anyway, only including a couple of files for block header creation from actual HSD/stratum data. If npm install completely fails you may need to install some of the tools described in the HSD install docs.

When we run HSD with stratum support we run like this::

```
./bin/hsd --network=testnet --cors=true --api-key=earthlab --http-host=0.0.0.0 --coinbase-address=ts1q59rxjegn030vwe0z3jjgx76j6ql44tpfwkjv5g --index-address=true --index-tx=true --listen --plugins hstratum --stratum-host 0.0.0.0 --stratum-port 3008 --stratum-public-host 0.0.0.0 --stratum-public-port 3008 --stratum-max-inbound 1000 --stratum-difficulty 8 --stratum-dynamic --stratum-password=earthlab
```
^^ Notice the --coinbase-address field: that's your wallet you'd like to mine to.


**MINER CONFIGURATION**
Modify the JSON in config.json
```
{
  "gpus":"1", //pass in "-1" here to list your available GPU's/the # you want, prob "1" for single cards/laptops
  "gpu_platform":"0", //probably 0 for mac or laptops, my windows 10 rig was "1"
  "gpu_mfg":"AMD", //AMD||NVIDIA
  "host":"127.0.0.1", //stratum host
  "port":"3008", //stratum port
  "stratum_user":"earthlab", //optional, for pool stratum mining only: your username in the stratum
  "stratum_pass":"earthlab", //stratum password you started hsd with
  "wallet":"ts1q59rxjegn030vwe0z3jjgx76j6ql44tpfwkjv5g" //optional, for pool stratum mining only: your wallet
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
  ...

}
```
Likely they are the same ones you mine with on your rig config elsewhere. If you don't know, pass in "-1" into "gpus" and the log will list the possible GPU's. GPU Platform is probably "0" on most laptops/single card machines. On my Windows rig it's "1". Passing in "-1" in the gpus field will answer for you.

**Mac/Ubuntu(18.04) Installation :**

0. First, clone the [HSD repo from github](https://github.com/handshake-org/hsd) if you dont have HSD (follow their install instructions for hsd). Alternately node will install in ./node_modules/hsd after you npm install.. make sure to ```brew install libunbound-dev OR apt install libunbound-dev``` if you dont want to see those annoying warnings about unbound (which it will run fine without, ps)...
1. cd into the hsd repo base directory and run ```npm install github:HandshakeAlliance/hstratum```
After that you should have hstratum all set.
2. To start HSD with stratum support, cd back into the hsd repo root and: 
```
./bin/hsd --network=testnet --cors=true --api-key=earthlab --http-host=0.0.0.0 --coinbase-address=ts1q59rxjegn030vwe0z3jjgx76j6ql44tpfwkjv5g --index-address=true --index-tx=true --listen --plugins hstratum --stratum-host 0.0.0.0 --stratum-port 3008 --stratum-public-host 0.0.0.0 --stratum-public-port 3008 --stratum-max-inbound 1000 --stratum-difficulty 8 --stratum-dynamic --stratum-password=earthlab
```
^^ Notice the --coinbase-address field: that's your wallet you'd like to mine to.

3. Now that stratum is up and running (feel free to run with --daemon once you have it doing good stuff), if this is the first time you spun it up, you'll need to authorize your miner to the stratum. Just start HandyMiner up by doing: 
```
cd (into this directory)
npm install //only if you didnt already do so
npm run-script authorize
```
Authorize will start HandyMiner too!

**THE POINT::**

From this point on, you can now launch the miner with:
```
cd (into this directory)
npm start
```
Mine blocks!

**Windows HSD installation::**

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
OR just 
docker exec -it 26137f087795 bash
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
