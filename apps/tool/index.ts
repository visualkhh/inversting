import 'reflect-metadata';
import readline from 'readline';
import { BodyPix } from './src/BodyPix';
import * as path from 'path';
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import { DeeplabService } from './src/object-detect/DeeplabService';
import { CocoSsdService } from './src/object-detect/CocoSsdService';
import { Action } from './src/action/Action';
import { RandomProfile } from './src/random/RandomProfile';
import { SimpleApplication } from '@dooboostore/simple-boot/SimpleApplication';
import { SimOption } from '@dooboostore/simple-boot/SimOption';
import { Sim } from '@dooboostore/simple-boot/decorators/SimDecorator';
import { OnSimCreateCompleted } from '@dooboostore/simple-boot/lifecycle/OnSimCreateCompleted';
import { OnSimCreate } from '@dooboostore/simple-boot/lifecycle/OnSimCreate';
import { DatabaseService } from 'service/database/DatabaseService';
import { Inject } from '@dooboostore/simple-boot/decorators/inject/Inject';
import { Task } from 'service/task';
//
console.log('--------tools LazyCollect Test --------');
@Sim
class TerminalInput implements OnSimCreate {
  constructor(private databaseService: DatabaseService, @Inject({symbol: Task.SYMBOL}) private tasks: Task[]) {
    // console.log('------', tasks)
  }

  onSimCreate() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
//
// const bodyPixInstance = new BodyPix();
// const deeplabService = new DeeplabService();
// const cocoSsdService = new CocoSsdService();
// const action = new Action();
// const randomProfile = new RandomProfile();
//
    const info = this.tasks.map(it => it.summaryDescription()).join(',')
    const question = () => {
      rl.question(`\n\n\x1b[33m${info} :: (q)quit\x1b[0m`,
        async (answer) => {
          console.log('Selected:', answer);
          try {
            if (answer === 'q') {
              rl.close();
              process.exit();
            } else {
              for (let task of this.tasks) {
                const sw = await task.isSupport(answer);
                if (sw) {
                  await task.execute();
                }
              }
            }
          } catch (e) {
            console.error(e);
          } finally {
            if (answer !== 'q') {
              question();
            }
          }
        }
      );
    };
//
    question();
// console.log('------------------------------------');
  }


  say() {
    console.log('sauy')
  }
}

const app = new SimpleApplication(new SimOption());
app.run();
const t = app.sim(TerminalInput)
