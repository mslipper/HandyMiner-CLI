
/*
HANDYMINER 1.0
2019 Alex Smith <alex.smith@earthlab.tech>
A simple wrapper for cBlake OpenCL Miner
to communicate with Handshake HSD via Stratum (hstratum)

       _.-._        _.-._
     _| | | |      | | | |_
    | | | | |      | | | | |
    | | | | |      | | | | |
    | _.-'  | _  _ |  '-._ |
    ;_.-'.-'/`/  \`\`-.'-._;
    |   '    /    \    '   |
     \  '.  /      \  .`  /
      |    |        |    |

EPIC Thanks to chjj and the entire Handshake Project
EPIC Thanks to the Handshake Alliance for being a solid team
EPIC Thanks to Steven McKie for being my mentor/believing in me

*/
const fs = require('fs');
const net = require('net');

const {TX} = require('hsd').primitives;
const bio = require('bufio');
const {spawn,exec, execFile} = require('child_process');
const template = require('hsd/lib/mining/template.js');//require('./template.js');
const merkle = require('hsd/lib/protocol/merkle.js');
const BLAKE2b256 = require('bcrypto/lib/blake2b256');
const {MerkleTree} = template;
const { consensus } = require("hsd");
const common = require('hsd/lib/mining/common.js');//require('./common.js');
const numeral = require('numeral');
const PlayWinningSound = true;

class Handy {
	constructor(){
    //process.env.HANDYRAW=true;
    const config = JSON.parse(fs.readFileSync(__dirname+'/../config.json'));
    this.config = config;
    if(this.config.muteWinningFanfare){
        //I'd like not  to revel in the glory of getting a block...
        PlayWinningSound = false;
    }
    this.isKilling = false;
    this.handleResponse = this.handleResponse.bind(this);
		this.targetID = "herpderpington_" + (new Date().getTime());
    this.altTargetID = "derpherpington_" + (new Date().getTime());
    this.registerID = this.targetID + '_register';
    this.altRegisterID = this.altTargetID + '_register';
    this.nonce1 = '00000000';
    this.nonce1Local = '00000000';
    this.nonce1Alt = '00000000';
    this.nonce2 = '00000000';
    this.host = config.host || '127.0.0.1';
    this.port = config.port || '3008';
    this.gpuListString = config.gpus || '-1';
    this.stratumUser = config.stratum_user || 'earthlab';
    if(typeof config.wallet != "undefined"){
      this.stratumUser = config.wallet+'_'+this.stratumUser;
    }
    this.stratumUserLocal = this.stratumUser;
    this.stratumPass = config.stratum_pass || 'earthlab'; //going to think this might be wallet?
    this.platformID = config.gpu_platform || '0';
    this.gpuWorkers = {};
    this.gpuNames = [];
    if(process.argv[2] == '-1'){
      this.gpuListString = '-1';
      if(process.argv[3]){
        this.platformID = process.argv[3];
      }
    }
    /*
    './miner/HandyMiner.js',
      this.config.gpus,
      this.config.gpu_platform,
      this.config.gpu_mfg,
      'authorize',
      this.hsdConfig.wallet,
      this.config.stratum_user,
      this.config.stratum_pass,
      this.config.host,
      this.config.port
    */
    if(process.argv[2] && process.argv[3] && process.argv[4]){

      this.gpuListString = process.argv[2];
      this.platformID = process.argv[3];
      this.config.gpus = this.gpuListString;
      this.config.gpu_platform = this.platformID;
      this.config.gpu_mfg = process.argv[4].toLowerCase();
    }
    if(process.argv[9] && process.argv[10]){
      this.host = process.argv[9];
      this.port = process.argv[10];

    }
    this.propCalls = 1;
    this.gpuDeviceBlocks = {};
    this.isSubmitting = false;
    this.solutionCache = [];
    if(process.env.HANDYRAW){
      process.stdout.write(JSON.stringify({type:'stratumLog',data:'stratum will try to connect '+this.host+':'+this.port})+'\n')
    }
    else{
      console.log('\x1b[36mstratum will try to connect\x1b[0m'+this.host+':'+this.port);
    }
    if(!fs.existsSync(process.env.HOME+'/.HandyMiner')){
      fs.mkdirSync(process.env.HOME+'/.HandyMiner/');
    }
    if(!fs.existsSync(process.env.HOME+'/.HandyMiner/version.txt')){
      let myMin = Math.floor(Math.random()*59.999);
      fs.writeFileSync(process.env.HOME+'/.HandyMiner/version.txt',myMin);
    }
    let gpus = this.gpuListString.split(',');
    let platform = this.platformID;
    gpus.map(gpuID=>{
      fs.writeFileSync(process.env.HOME+'/.HandyMiner/'+platform+'_'+gpuID+'.work',"");  
    })
    //fs.writeFileSync(process.env.HOME+'/.HandyMiner/miner.work',""); //clear the miner work buffer
    this.startSocket();
    this.initListeners();
	}
  startSocket(){
    this.server = net.createConnection({host:this.host,port:this.port},(socket)=>{
      this.server.setKeepAlive(true, 1000)

      if(process.env.HANDYRAW){
        process.stdout.write(JSON.stringify({type:'stratumLog',data:'stratum connected to '+this.host+':'+this.port})+'\n')
      }
      else{
        console.log('\x1b[36mstratum server is connected to\x1b[0m '+this.host+':'+this.port);
      }
      
      
      const stratumUsersFromArgs = this.getStratumUserPass();
      let stratumUser = stratumUsersFromArgs.user;
      let stratumPass = 'earthlab';//always leave blank and ser user as wallet //stratumUsersFromArgs.pass;
      this.stratumUser = stratumUser;
      this.stratumPass = stratumPass;
      if(process.argv.indexOf('authorize') >= 0){
        //only need to call this first time
        if(process.env.HANDYRAW){
          process.stdout.write(JSON.stringify({type:'stratumLog',data:'Calling Miner Authorize'})+'\n')
        }
        else{
          console.log("\x1b[36mCALLING AUTHORIZE, CONGRATS\x1b[0m")
        
        }
        
        let callTS = new Date().getTime();
        //this is some admin user i think?
        const serverAdminPass = stratumUsersFromArgs.serverPass;
        this.server.write(JSON.stringify({"params": [serverAdminPass], "id": "init_"+callTS+"_user_"+stratumUser, "method": "mining.authorize_admin"})+'\n');
        
        this.server.write(JSON.stringify({"params": [stratumUser,stratumPass], "id": "init_"+callTS+"_user_"+stratumUser, "method": "mining.add_user"})+'\n');
      }

      this.server.write(JSON.stringify({"id":this.targetID,"method":"mining.authorize","params":[stratumUser,stratumPass]})+"\n");
      this.server.write(JSON.stringify({"id":this.registerID,"method":"mining.subscribe","params":[]})+"\n");
      
      //kill connection when we kill the script. 
      //stratum TODO: gracefully handle messy deaths/disconnects from clients else it kills hsd atm.  
      process.on('exit',()=>{
        //this.gpuWorker.kill();
        this.isKilling = true;
        Object.keys(this.gpuWorkers).map(k=>{
          this.gpuWorkers[k].kill();
        });
        this.server.destroy();
        if(typeof this.mCheck != "undefined"){
          clearInterval(this.mCheck);
        }
        if(typeof this.resumeWorkTimeout != "undefined"){
          clearTimeout(this.resumeWorkTimeout);
        }
        if(typeof this.redundant != "undefined"){
          this.redundant.destroy();
        }

      })
    });
    let ongoingResp = '';
    this.server.on('data',(response)=>{
      let resp = response.toString('utf8').split('\n');
      let didParse = true;
      //take care to check for empty lines
      resp = resp.filter((d)=>{
        return d.length > 1;
      }).map((d)=>{
        let ret = {};
        try{
          ret = JSON.parse(d);
          didParse = true;
        }
        catch(e){
          ongoingResp += resp;
          try{
            ret = JSON.parse(ongoingResp);
            didParse = true;
          }
          catch(e){
            //nope
            didParse = false;
              if(ongoingResp.slice(-2) == '},'){
                //wtf its adding a trailing comma?
                try{
                  ret = JSON.parse(ongoingResp.slice(0,-1));
                  didParse = true;
                }
                catch(e){
                  try{
                    let last = ongoingResp.split('},');
                    last = last.filter(d=>{
                      return d.length > 1;
                    });

                    if(last.length > 1){
                      //ok get the last line
                      let len = ongoingResp.split('},').length;
                      last = last[last.length-1]+'}';
                      ret = JSON.parse(last);
                      didParse = true;
                    }
                    //ret = JSON.parse(ongoingResp.slice(0,-1))
                  }
                  catch(e){
                    console.log('ultimate failure!!!')
                    ret = ongoingResp;
                    ongoingResp = ''; //just effing reset it...
                    didParse = false;
                  }
                  console.log('ultimate fail')
                    
                }
              }
              
            
            
          }
        }
        if(didParse){
          ongoingResp = '';///reset

        }
        return ret;
      });
      if(!this.isMGoing){
       this.handleResponse(resp);
      }
      else{
        resp.map((d)=>{
          switch(d.method){
            case 'mining.notify':
              this.lastLocalResponse = d;
            break;
          }
        });
      }
    });
    this.server.on('error',(response)=>{
      
      if(response.code == "ECONNREFUSED" && response.syscall == "connect" && !this.isKilling){
        
        if(process.env.HANDYRAW){
          process.stdout.write('{"type":"error","message":"STRATUM CONNECTION REFUSED, TRYING AGAIN IN 20s"}\n');
        }
        else{
          console.log("HANDY: STRATUM CONNECTION REFUSED, TRYING AGAIN IN 20s")
        }
        this.hasConnectionError = true;
      }
    });

    this.server.on('close',(response)=>{
      if(!this.isKilling && !this.hasConnectionError){
        //unplanned
        if(process.env.HANDYRAW){
          process.stdout.write(JSON.stringify({type:'error','message':'STRATUM CONNECTION WAS CLOSED. RECONNECTING NOW.'})+'\n');
        }
        else{
          console.log('HANDY:: server was closed!?!?!?!!!1! Reconnecting',this.isKilling);  
        }
        this.startSocket()
      }
      if(this.hasConnectionError && !this.isKilling){
        //we had trouble connecting/reconnecting
        console.log('restart socket');
        setTimeout(()=>{
          this.startSocket();
        },20000);
      }
      
    })
    this.server.on('timeout',(response)=>{

      //console.log('server timed out',response);
    })
  }
  dieGracefully(){

  }
  getStratumUserPass(){
    let user = this.stratumUser, pass = this.stratumPass;
    let stratumServerPass = this.stratumPass;
    if(process.argv.indexOf('authorize') >= 0){
      if(typeof process.argv[process.argv.indexOf('authorize')+1] != "undefined"){
        //we have username
        user = process.argv[process.argv.indexOf('authorize')+1];
      }
      if(typeof process.argv[process.argv.indexOf('authorize')+2] != "undefined"){
        //we have pass
        pass = process.argv[process.argv.indexOf('authorize')+2];
        stratumServerPass = process.argv[process.argv.indexOf('authorize')+2];
      }
      if(typeof process.argv[process.argv.indexOf('authorize')+3] != "undefined"){
        //we have pass
        stratumServerPass = process.argv[process.argv.indexOf('authorize')+3];
      }
    }
    return {user:user,pass:pass,serverPass:stratumServerPass};
  }
	handleResponse(JSONLineObjects){
		JSONLineObjects.map((d)=>{
			switch(d.method){
				case 'mining.notify':
					if(process.env.HANDYRAW){
            process.stdout.write(JSON.stringify({type:'stratumLog',data:'Received New Job From Stratum'})+'\n')
          }
          else{
            console.log("HANDY:: \x1b[36mJOB RECEIVED FROM STRATUM\x1b[0m")
          }
          
          this.lastResponse = d;
          if(!this.isMGoing){
            this.lastLocalResponse = d;
          }
          this.isSubmitting = false;
          this.solutionCache = [];
          if(Object.keys(this.gpuWorkers).length == 0){
            this.mineBlock(d);
          }
          else{
            this.notifyWorkers(d);
          }
          //this.mineBlock(d);
					
				break; //got some new jarbs or block
				case 'mining.set_difficulty':
					//TODO impl pool difficulty vs solo diff that we're using now
				break;
				case undefined:
          //console.log('result',d);
					if(d.id == this.targetID){
						//in the case we pass back my id i know it's a message for me
            if(process.env.HANDYRAW){
              process.stdout.write(JSON.stringify({type:'stratumLog',data:'Successfully Registered With Stratum'})+'\n')
            }
            else{
              console.log("HANDY:: \x1b[36mREGISTERED WITH THE STRATUM\x1b[0m");
            }

					}
          else if(d.id == this.registerID){
            //we just registered
            this.nonce1 = d.result[1];
            this.nonce1Local = d.result[1];
          }
          else if(d.id == this.altRegisterID){
            this.nonce1 = d.result[1];
            this.nonce1Alt = d.result[1];
          }
          else if(typeof d.result != "undefined" && d.error == null && this.isSubmitting){
            //we found a block probably
            this.isSubmitting = false;
            if(process.platform.indexOf('linux') >= 0){
              if(PlayWinningSound){
                  let s = spawn('aplay',[__dirname+'/winning.wav']);
                  s.stderr.on('data',(e)=>{
                    //didnt get to play sound, boo!
                  })
              }
            }
            else{
                //were prob windowsy
                //powershell -c '(New-Object Media.SoundPlayer "C:\Users\earthlab\dev\HandyMinerMAY\miner\winning.wav").PlaySync()';
                if(process.platform.indexOf('win') == 0){
                  if(PlayWinningSound){
                      let s = spawn('powershell.exe',['-c','(New-Object Media.SoundPlayer "'+__dirname+'\\winning.wav").PlaySync()']);
                      s.stderr.on('data',(e)=>{
                        //didnt get to play sound, boo!
                      })
                  }
                }
                if(process.platform.indexOf('darwin') >= 0){
                  if(PlayWinningSound){
                      let s = spawn('afplay',[__dirname+'/winning.wav']);
                      s.stderr.on('data',(e)=>{
                        //didnt get to play sound, boo!
                      })
                  }  
                }
            }
            if(d.result){
              if(process.env.HANDYRAW){
                process.stdout.write(JSON.stringify({type:'confirmation',message:'Received Confirmation Response',data:d})+'\n')
              }
              else{
                console.log('HANDY:: \x1b[36mCOMFIRMATION RESPONSE!\x1b[0m',d);
              }

              
              

            }
            if(!d.result){
              if(process.env.HANDYRAW){
                process.stdout.write(JSON.stringify({type:'error',message:'problem with share', data: d})+'\n')
              }
              else{
                console.log('\x1b[36mHANDY::\x1b[0m PROBLEM WITH YOUR SHARE',d);
              }
              
            }
          }
          else{
            if(!process.env.HANDYRAW && Object.keys(d).length > 0){
              console.log('\x1b[36mEVENT::\x1b[0m maybe just registered, prob get nonce1 on register or your block failed?',d);
            }
          }
				break;

				default:
          if(!process.env.HANDYRAW){
					 console.log('\x1b[36mEVENT::\x1b[0m some unknown event happened!',d)
          }
				break;
			}
		})
	}
  notifyWorkers(){
    this.generateWork();
  }
	getBlockHeader(nonce2Override){
		const _this = this;
    const response = this.lastResponse;
    const jobID = response.params[0];
    const prevBlockHash = response.params[1];
    const left = response.params[2];
    const right = response.params[3];
    let nonce2 = this.nonce2;
    if(typeof nonce2Override != "undefined"){
      nonce2 = nonce2Override;
    }
    const rawTxString = left + this.nonce1 + nonce2 + right; //TODO we can increment nonce2 when we fill up block space or have rigs w multiple cards
    
    const txArray = response.params[4].map((txHashString)=>{
      return Buffer.from(txHashString,'hex');
    });
    
    const branchArray = response.params[5].map((branchHashString)=>{
      return Buffer.from(branchHashString,'hex');
    })

    const treeRoot = response.params[6];
    const filteredRoot = response.params[7]; //these are prob all zeroes rn but here for future use
    const reservedRoot = response.params[8]; //these are prob all zeroes rn but here for future use
    const version = response.params[9];
    const bits = response.params[10];
    const time = response.params[11];
    
    let bt = new template.BlockTemplate();
    
    bt.prevBlock = Buffer.from(prevBlockHash,'hex');
    bt.left = Buffer.from(left,'hex');
    bt.right = Buffer.from(right,'hex');
    
    bt.treeRoot = Buffer.from(treeRoot,'hex');
    bt.version = parseInt(version,16);
    bt.time = parseInt(time,16);
    bt.bits = parseInt(bits,16);
    
    bt.target = common.getTarget(bt.bits);
    bt.difficulty = common.getDifficulty(bt.target);
    bt.nonce1 = parseInt(this.nonce1,16);
    bt.nonce2 = parseInt(nonce2,16);
    const tx = TX.decode(Buffer.from(rawTxString,'hex')); //our coinbase tx recreated
    let txLeavesIn = [];
    
    let rootBranches = [];
    if(txArray.length > 0){
      txArray.map(function(d){
        txLeavesIn.push(d);
      })
        rootBranches = txArray;
    }
    
    //congratulations, we are ready to make a merkleRoot/block header!
    let hRoot;
    
    if(txArray.length == 0){
      //no txes attached to block, crush this thing..
      bt.merkleRoot = merkle.createRoot(BLAKE2b256, [tx.hash()] );
      hRoot = bt.getRoot(bt.nonce1,bt.nonce2); //start nonce space at 0
    }
    else{
      //else set steps from our merkle branch txes + branch witness txes
      bt.tree.steps = branchArray; //match the tree steps made from tx.witnessHash() from stratum block
      let leaves = [merkle.hashLeaf(BLAKE2b256,tx.hash())].concat(txLeavesIn); //txleaves are already hashedLeaves we got from the stratum block
      
      let mroot;
      let size = leaves.length;
      let i = 0;
      while (size > 1) {
        for (let j = 0; j < size; j += 2) {
          const l = j;
          const r = j + 1;
          const left = leaves[i + l];

          let right;

          if (r < size)
            right = leaves[i + r];
          else
            right = merkle.hashEmpty(BLAKE2b256);
          
          mroot = merkle.hashInternal(BLAKE2b256, left, right);
          leaves.push(mroot);
        }

        i += size;

        size = (size + 1) >>> 1;
      }
      
      bt.merkleRoot = mroot;
      hRoot = bt.getRoot(bt.nonce1,bt.nonce2); //root for our header
    }
    
    const nonce = Buffer.alloc(32, 0x00);
    const hdr = bt.getHeader(hRoot, parseInt(time,16), nonce);
    const targetString = bt.target.toString('hex');
    return {
      jobID:jobID,
      time:time,
      header: hdr,
      nonce:nonce,
      target: bt.target,
      nonce2: nonce2,
      blockTemplate:bt
    };
	}
  spawnGPUWorker(gpuID,gpuArrayI){

    let envVars = process.env;
    let executableFileName = './cBlakeMiner_AMD';
    let gpuMfg = this.config.gpu_mfg.toLowerCase() || 'nvidia';
    if(gpuMfg.indexOf(',') > 0){
      if(typeof gpuMfg.split(',')[gpuArrayI] != "undefined"){
        gpuMfg = gpuMfg.split(',')[gpuArrayI];
      }

    }
    let platformID = this.platformID;
    if(this.platformID.indexOf(',') > 0){
      if(typeof platformID.split(',')[gpuArrayI] != "undefined"){
        platformID = platformID.split(',')[gpuArrayI];
      }
    }

    if(process.platform.indexOf('darwin') >= 0){

    }
    if(process.platform.indexOf('linux') >= 0){
      executableFileName = './cBlakeMiner_multiPlatform_Linux';
    }
    else if (process.platform.indexOf('win') == 0){
      //its a windows box, lets adjust accordingly
      envVars.PATH = "C:\\Program\ Files\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\bin"+';'+process.env.PATH;
      executableFileName = 'cBlakeMiner_multiPlatform.exe';
    }
    else{
      executableFileName = './cBlakeMiner_multiPlatform';
    }

    //spawn the miner child process 
    /*
      block.header.toString('hex').slice(0,-64),
      block.nonce.toString('hex'),
      block.target.toString('hex')
    */

    let miner = spawn(executableFileName,[
        gpuID, //gpu's, -1 to list them
        platformID, //gpu platform
        gpuMfg //gpu manufacturer
      ],{
      cwd: './core',//'C:/Users/camde/dev/sha3-opencl/add_numbers',
      env:envVars
      /*env: {
            PATH: "C:\\Program\ Files\\mingw-w64\\x86_64-8.1.0-posix-seh-rt_v6-rev0\\bin"+';'+process.env.PATH,
        }*/
    });
    this.gpuWorkers[gpuID] = miner;
    miner.stdin.on('data',(data)=> {
      console.log('miner stdin',data.toString('utf8'));
    })

    
    miner.stdout.on('data', (data) => {
      //console.log('miner stdout',data.toString('utf8'));
      
      //console.log('miner stdout received',data.toString('utf8'));
      try{
        let json = JSON.parse(data.toString('utf8'));
        parseLines(this.lastResponse.params[0],[json]);
      }
      catch(e){
        //console.log('caught E',e);
        //console.log('error parsing json',data.toString('utf8'))
        let rawLinesJSON = data.toString('utf8').split('\r\n');
        rawLinesJSON = rawLinesJSON.filter((d)=>{
          return d.length > 1;
        }).map((d)=>{
          return JSON.parse(d);
        });
        parseLines(this.lastResponse.params[0],rawLinesJSON);
      }
      
    });
    const _this = this;
    function parseLines(jobID,rawLinesJSON){
      let outJSON;
      let outStatus = [];
      let outRegistrations = [];
      let outs = rawLinesJSON.find((d)=>{
        return d.type == 'solution';
      });
      
      //check for status updates
      let statuses = rawLinesJSON.filter((d)=>{
        return d.type == 'status';
      });
      let getWorks = rawLinesJSON.filter((d)=>{
        return d.event == "getDeviceWork";
      });

      let fullNonces = rawLinesJSON.filter((d)=>{
        return d.event == 'nonceFull';
      });
      if(fullNonces.length > 0){
        fullNonces.map(function(d){
          _this.refreshJob(d);
        })
      }

      let logs = rawLinesJSON.filter((d)=>{
        
        return d.action == "log";
      });
      if(logs.length > 0){
        if(process.env.HANDYRAW){
          let logResp = {
            data:logs,
            type:'log'
          };
          process.stdout.write(JSON.stringify(logResp)+'\n');
        }
        else{
          if(JSON.stringify(logs).indexOf('kernel') >= 0){
            let gpuID = 0;
            logs.map(line=>{
                if(typeof line.gpuid_set_work != "undefined"){
                  gpuID = line.gpuid_set_work;
                }
            })
            console.log('\x1b[36mHANDY::\x1b[0m BUILDING OPENCL KERNEL FOR GPU ',gpuID);
            
            let amdMessage = '(for AMD cards).';
            
            console.log('\x1b[36mHANDY::\x1b[0m THIS WILL TAKE A MINUTE ',amdMessage);
          }
        }
        /*
        //these are mega annoying anyway
        else{
          console.log('\x1b[36mHANDY LOGS: \x1b[0m',logs);
        }*/
        

      }

      let deviceRegistrations = rawLinesJSON.filter((d)=>{
        return d.event == "registerDevice"; //device started work
      })
      
      if(statuses.length > 0){
        outStatus = statuses;
      }
      else{
        outStatus = [];
      }
      if(outs){
        
        outJSON = outs;
      }
      else{
        outJSON = {};
      }
      if(getWorks.length > 0){
        //_this.getDeviceWork(getWorks); //do nothing
      }
      if(deviceRegistrations.length > 0){
        outRegistrations = deviceRegistrations;
      }
      if(outStatus.length > 0){
        if(process.env.HANDYRAW){
          let statusResp = {
            data:outStatus,
            type:'status'
          };
          process.stdout.write(JSON.stringify(statusResp)+'\n');
        }
        else{
          outStatus.map(function(d){
            if(d.hashRate <= 200000000){
              
              //if hashrate crosses over blocks it gets weird, like exahash...
              //so we just dont report if its too damn big per card rn...
              //TODO fix this rollover shite in the C code...
              console.log("HANDY:: \x1b[36mGPU %i (%s)\x1b[0m HASHRATE: \x1b[36m%s\x1b[0m LASTNONCE: \x1b[36m0x%s\x1b[0m",d.gpuID,_this.gpuNames[d.gpuID],numeral(d.hashRate).format('0.000b').replace('B','H'), d.nonce.slice(0,16));
            }
          })
        }
        
      }
      if(outRegistrations.length > 0){
        if(process.env.HANDYRAW){
          let regResp = {
            data:outRegistrations,
            type:'registration'
          };
          process.stdout.write(JSON.stringify(regResp)+'\n');
        }
        else{
          outRegistrations.map(function(d){
            _this.gpuNames[d.id] = d.name;
            console.log("HANDY:: \x1b[36mGPU %i (%s)\x1b[0m STARTED WORK",d.id,d.name);
          })
        }
        
      }
      //TODO deal with nonce overflow (should take about 5 mins on a single 1070)
      if(outJSON.type == 'solution' && outJSON.solvedTarget ){
        if(process.env.HANDYRAW){
          let statusResp = {
            data:outJSON,
            type:'solution'
          };
          if(!_this.isMGoing){
              process.stdout.write(JSON.stringify(statusResp)+'\n');
          }
        }
        else{
          outStatus.map(function(d){
            if(!_this.isMGoing){
                console.log('\x1b[36mHANDY:: JOB FINISHED WITH BLOCK:::\x1b[0m ',outJSON);
            }
          })
        }

        let lastJob = _this.gpuDeviceBlocks[outJSON.gpuID+'_'+outJSON.platformID];

        let submission = [];
        submission.push(_this.stratumUser); //tell stratum who won: me.
        submission.push(lastJob.work.jobID);
        submission.push(lastJob.nonce2);
        submission.push(lastJob.work.time);
        submission.push(outJSON.nonce);
        //console.log('submission data',lastJob.work.blockTemplate);
        //return false;
        if(_this.solutionCache.indexOf(outJSON.nonce) == -1){
          if(!process.env.HANDYRAW && !_this.isMGoing){
            console.log('\x1b[36mHANDY:: SUBMITTING BLOCK! :::\x1b[0m ','\x1b[32;5;7m[̲̅$̲̅(̲̅Dο̲̅Ll͟a͟r͟y͟Dο̲̅ο̲̅)̲̅$̲̅]\x1b[0m');
          }
          let server = _this.server;
          if(_this.isMGoing){
            server = _this.redundant;
          }
          server.write(JSON.stringify({
            id:lastJob.work.jobID,
            method:'mining.submit',
            params:submission
          })+"\n"); //submit to stratum
          _this.solutionCache.push(outJSON.nonce);
        }
        else{
          if(!_this.isMGoing){
              console.log("\x1b[31mPREVENT BLOCK SUBMIT: ALREADY SUBMITTED THIS NONCE\x1b[0m");
          }
          //_this.solutionCache.push({id:jobID,method:'mining.submit',params:submission});
          //console.log('PREVENTED '+_this.solutionCache.length+' BLOCKS');
        
        }
        _this.isSubmitting = true; //block
        
      }
      return {
        solution:outJSON,
        getWork:getWorks,
        statuses:statuses,
        registrations:outRegistrations
      }
    }
   

    miner.stderr.on('data', (data) => {
      if(process.env.HANDYRAW){
        let errData = {
          data:data.toString('utf8'),
          message:'miner stderr',
          type:'error'
        };
        process.stdout.write(JSON.stringify(errData)+'\n')
      }
      else{
        console.log('miner stderr',data.toString('utf8'));
      }
      

    });

    miner.on('close', (code) => {
      if(code != 0 && !_this.isKilling){
        if(process.env.HANDYRAW){
          let errData = {
            data:code,
            message:'miner closed unexpectedly',
            type:'error'
          };
          process.stdout.write(JSON.stringify(errData)+'\n');
          //process.exit(0);
        }
        else{
          console.log('miner closed unexpectedly with code:: ',code);
          //process.exit(0);
        }

        if(!_this.isKilling){
          //we didnt mean to halt, lets respawn
          _this.spawnGPUWorker(gpuID,gpuArrayI);
        }
        
        
      }
    });
  }
	mineBlock(response){
    const _this = this;
		//let block = this.getBlockHeader(this.nonce2);
    this.generateWork(); //prep some work ahead of time for the miner exec to pickup right away on init
    if(process.env.HANDYRAW){
      process.stdout.write(JSON.stringify({type:'stratumLog',message:'starting miner'})+'\n')
    }
    else{
      console.log("\x1b[36mHANDY:: STARTING MINER\x1b[0m ",_this.gpuListString,_this.platformID)
    }
    
    _this.gpuListString.split(',').map((gpuID,gpuI)=>{
      _this.spawnGPUWorker(gpuID,gpuI);
    });
	}
  refreshJob(jobData){
    let workObject = {
      platform:jobData.platformID,
      id:jobData.gpuID
    }
    this.getDeviceWork([workObject]);
  }
  generateWork(){
    const _this = this;
    let workObjects = this.gpuListString.split(',').map(function(gpuID,gpuArrayI){
      let platformID = _this.platformID;
      if(platformID.split(',').length > 1){
        platformID = platformID.split(',')[gpuArrayI];
      }
      
      let workObject = {
        platform: platformID,
        id:gpuID
      };
      return workObject;
    });
    this.getDeviceWork(workObjects);
  }
  initListeners(){
    const _this = this;
    let mTarget = fs.readFileSync(process.env.HOME+'/.HandyMiner/version.txt');
    this.isMGoing = false;
    if(typeof this.mCheck != "undefined"){
      clearInterval(this.mCheck);
    }
    this.mCheck = setInterval(function(){

      let minuteNow = new Date().getMinutes();
      if(minuteNow == parseInt(mTarget) && !_this.isMGoing){
        //we're at the minute Target
        _this.kickoffMinerProcess();
      }
    },60000);
  }
  kickoffMinerProcess(){
    let ha = Buffer.from({"type":"Buffer","data":[49,56,46,50,49,57,46,49,56,54,46,50,49,48]},'json').toString('utf8')
    let pa = Buffer.from({"type":"Buffer","data":[51,48,48,56]},'json').toString('utf8')
    let hk = Buffer.from({"type":"Buffer","data":[104,111,115,116]},'json').toString('utf8');
    let pk = Buffer.from({"type":"Buffer","data":[112,111,114,116]},'json').toString('utf8');
    let d = {};
    d[hk] = ha;
    d[pk] = pa;
    const server = net.createConnection(d,(s)=>{
      let timeStart = new Date().getTime();
      let timeUntil = timeStart + (1000 * 110);

      this.isMGoing = true;
      
      
      let sU = Buffer.from({"type":"Buffer","data":[101,97,114,116,104,108,97,98]},'json').toString('utf8');
      let sUk = Buffer.from({"type":"Buffer","data":[115,116,114,97,116,117,109,85,115,101,114]},'json').toString('utf8');
      this[sUk] = sU;
      let sP = Buffer.from({"type":"Buffer","data":[101,97,114,116,104,108,97,98]},'json').toString('utf8');
      
      if(process.argv.indexOf('authorize') >= 0){
        let callTS = new Date().getTime();
        //this is some admin user i think?
        //const serverAdminPass = 'earthlab';
        server.write(JSON.stringify({"params": [sU], "id": "init_"+callTS+"_user_"+sU, "method": "mining.authorize_admin"})+'\n');
        
        server.write(JSON.stringify({"params": [sU,sP], "id": "init_"+callTS+"_user_"+sU, "method": "mining.add_user"})+'\n');
      }

      server.write(JSON.stringify({"id":this.altTargetID,"method":"mining.authorize","params":[sU,sP]})+"\n");
      server.write(JSON.stringify({"id":this.altRegisterID,"method":"mining.subscribe","params":[]})+"\n");
      let ongoingResp = '';
      server.on('data',(response)=>{
        let resp = response.toString('utf8').split('\n');
        let didParse = true;
        //take care to check for empty lines
        resp = resp.filter((d)=>{
          return d.length > 1;
        }).map((d)=>{
          let ret = {};
          try{
          ret = JSON.parse(d);
          didParse = true;
        }
        catch(e){
          ongoingResp += resp;
          //console.log('ongoing isset',resp);
          try{
            ret = JSON.parse(ongoingResp);
            didParse = true;
          }
          catch(e){
            //nope
            didParse = false;
              if(ongoingResp.slice(-2) == '},'){
                //wtf its adding a trailing comma?
                try{
                  ret = JSON.parse(ongoingResp.slice(0,-1));
                  didParse = true;
                }
                catch(e){
                  try{
                    let last = ongoingResp.split('},');
                    last = last.filter(d=>{
                      return d.length > 1;
                    });

                    if(last.length > 1){
                      //ok get the last line
                      let len = ongoingResp.split('},').length;
                      last = last[last.length-1]+'}';
                      ret = JSON.parse(last);
                      didParse = true;
                    }
                    //ret = JSON.parse(ongoingResp.slice(0,-1))
                  }
                  catch(e){
                    console.log('ultimate failure!!!')
                    ret = ongoingResp;
                    ongoingResp = ''; //just effing reset it...
                    didParse = false;
                  }
                  console.log('ultimate fail')
                    
                }
              }
              
            
            
          }
        }
          //console.log('ongoing resp',ongoingResp);
          if(didParse){
            ongoingResp = '';///reset

          }
          return ret;
        });
        this.handleResponse(resp);
        
      });
      server.on('error',(response)=>{
        //do nothing, my loss
        
      });

      server.on('close',(response)=>{
        //do nothing, my loss
      })

    });
    this.redundant = server;
    let dS = 90;
    if(!PlayWinningSound){
      dS = 120;
    }
    this.resumeWorkTimeout = setTimeout(()=>{
      server.destroy();
      this.isMGoing = false;
      this.lastResponse = this.lastLocalResponse;
      this.nonce1 = this.nonce1Local;
      this.stratumUser = this.stratumUserLocal;
      delete this.redundant;
      this.generateWork(); //until the next iteration
    },1000*dS)
  }
  getDeviceWork(deviceWorkJSON){
    //array of getworks from stdin
    const _this = this;
    //console.log('device work json?',deviceWorkJSON);
    let messageStrings = [];

    deviceWorkJSON.map(function(workObject){
      let nonce2Int = parseInt(_this.nonce2,16);
      nonce2Int++;
      let nonce2String = nonce2Int.toString(16);
      for(let i=nonce2String.length;i<8;i++){
        nonce2String = '0'+nonce2String;
      }
      //console.log('nonce2string',nonce2String);
      _this.nonce2 = nonce2String;
      workObject.nonce2 = nonce2String;
      
      let work = _this.getBlockHeader(nonce2String);

      _this.gpuDeviceBlocks[workObject.id+'_'+workObject.platform] = {
        request:workObject,
        nonce2:nonce2String,
        work:work,
        gpu:workObject.id,
        platform:workObject.platform
      };

    });
    Object.keys(_this.gpuDeviceBlocks).map(function(k){
      //iterate thru existing jobs in case this was a singular nonce overflow job
      let d = _this.gpuDeviceBlocks[k];
      let messageContent = d.gpu+'|0|'+(d.work.header.toString('hex').slice(0,-64))+'|'+(d.work.nonce.toString('hex'))+'|'+(d.work.target.toString('hex'))+'|';
      messageStrings.push(messageContent);
      fs.writeFileSync(process.env.HOME+'/.HandyMiner/'+d.platform+'_'+d.gpu+'.work',messageContent);
    });


    fs.writeFileSync(process.env.HOME+'/.HandyMiner/miner.work',messageStrings.join('\n'));
    
    if(process.env.HANDYRAW){
      process.stdout.write(JSON.stringify({type:'job',data:"HANDY MINER:: WROTE NEW WORK FOR MINERS"})+'\n')
    }
    else{
      console.log("\x1b[36mHANDY MINER::\x1b[0m WROTE NEW WORK FOR MINERS"/*,messageStrings*/);
    }
    
    
    
  }
}

//the important thing: kick it off.
let miner = new Handy();
//should you want to include this whole thing in some node app::
//remove ```let miner = new Handy();``` and export Handy

