import { Canvas, ICanvasClass } from './canvas';
import { Ball } from './ball';
import { Bat, IBatClass, SideType as BatSideType } from './bat';
import { randomParameters } from './nn';

const settings = {
  speed: 1,
  mutationRate: 0,
  generation: 0,
  fitness: .5,
  maxFitness: 0
};
const gui = new (dat as any).GUI();
gui.add(settings, 'speed', 0, 16);

gui.add(settings, 'generation').listen();
gui.add(settings, 'fitness').listen();
gui.add(settings, 'maxFitness').listen();

function shuffle(a) {
    for (let i = a.length; i; i--) {
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}


const SEPARATOR = '-=-=-=-=-=-=-=-=-=-=-';
const SMALL_SEPARATOR = '---------------------';
const NN_LAYERS = [4, 15, 2];

interface IEvolutionClass {};

const rand = (min, max) => {
  return Math.round(min + (Math.random() * (max - min)));
}

class Evolution implements IEvolutionClass {
  private canvas: ICanvasClass;
  private leftBat: Bat;
  private rightBat: Bat;
  private roundActive;
  // FIFO queue
  private batsPool: Bat[];
  private isPlaying: boolean = false;
  private animationFrame;

  private roundNumber: number;
  private roundScore: number;
  private roundScores: number[];
  private prevSelected;

  public constructor() {
    this.canvas = new Canvas();
    this.createInitialRound();
  }

  private createInitialRound () {
    const batOptions = { canvas: this.canvas };

    this.batsPool = [];
    for (let i = 0; i < 50; i++) {
      const leftBat = new Bat({
        ...batOptions,
        side: BatSideType.Left,
        parameters: randomParameters(NN_LAYERS)
      });
      const rightBat = new Bat({
        ...batOptions,
        side: BatSideType.Right,
        parameters: randomParameters(NN_LAYERS)
      });
      this.batsPool.push(leftBat, rightBat);
    }
    this.runBatsQueue();
  }

  private async runBatsQueue() {
    console.log(SEPARATOR);
    console.log('');
    console.log(`> Starting selection pool # ${++settings.generation}`);

    this.roundNumber = 0;
    const processed = [];
    let maxFitness = 0;
    const len = this.batsPool.length;
    while (this.batsPool.length > 1) {
      await this.evaluateRound(this.batsPool[0], this.batsPool[1], performance.now());
      // remove the bats that were playing in bat
      const bat1 = this.batsPool.shift();
      const bat2 = this.batsPool.shift();
      processed.push(bat1);
      processed.push(bat2);
      if (maxFitness < bat1.getFitness()) {
        maxFitness = bat1.getFitness();
      }
      if (maxFitness < bat2.getFitness()) {
        maxFitness = bat2.getFitness();
      }
      settings.maxFitness = maxFitness;
      // add the winner bat at the end
      // console.log(`> (${settings.generation}) max fitness so far: ${maxFitness} / ${settings.fitness}`);
    }

    console.log(SMALL_SEPARATOR);
    console.log('');
    let selected = this.select(processed);

    settings.mutationRate = 0.005 * ((100 - selected.length) / (len));
    console.log(`> selected: ${selected.length}, mutationRate: ${settings.mutationRate}` );

    if (selected.length < 5) {
      settings.mutationRate *= (1 + (5 - selected.length));
      console.log(`> few made it, new mutation rate is: ${settings.mutationRate}`);
    }

    if (selected.length < 2) {
      selected = [ ...this.prevSelected, ...(selected || []) ];
      console.log('!no improvement!');
    }

    const mated = this.mateSpecies(selected);
    console.log('');
    console.log(SMALL_SEPARATOR);

    this.batsPool = mated;
    this.prevSelected = selected;
    this.runBatsQueue();
    console.log(SEPARATOR);
  }

  private select (processed: Bat[]): Bat[] {
    let filtered = [];

    let fitnessSum = 0;
    let fitnessMin = settings.fitness;
    let fitnessMax = 0;

    for (let i = 0; i < processed.length; i++) {
      const item = processed[i];
      const itemFitness = item.getFitness();
      if (itemFitness >= settings.fitness) {
        filtered.push(item);
        fitnessSum += itemFitness;
        if (fitnessMin >= itemFitness || (fitnessMin === settings.fitness)) {
          fitnessMin = itemFitness;
        }

        if (itemFitness > fitnessMax) {
          fitnessMax = itemFitness;
        }
        // console.log(`> specie passed selection: ${itemFitness},  `, item.getParameters())
      }
    }

    const SLICE_RATE = 100;
    if (filtered.length > SLICE_RATE) {
      filtered.sort((a, b) => {
        return b.getFitness() - a.getFitness();
      });

      filtered = filtered.slice(0, SLICE_RATE);
      const prevFitnessMin = fitnessMin;
      fitnessMin = filtered[filtered.length - 1].getFitness();
      console.log(`< Slice, new fitnessMin: ${fitnessMin}, previous fitnessMin: ${prevFitnessMin}`);
    }

    const fitnessMean = fitnessSum / filtered.length;

    console.log(`> ${filtered.length}/${processed.length} species passed selection with fitness of ${settings.fitness}, fitness mean is - ${fitnessMean}, fitness min is ${fitnessMin}`);
    if (filtered.length > 1) {
      // settings.fitness = (settings.fitness + (((fitnessMean - settings.fitness) / 2)) / 2) || fitnessMin;
      settings.fitness = fitnessMin;
    }

    return filtered;
  }

  private mateSpecies (items: Bat[]): Bat[] {
    const mated = [];
    const itemsCount= Math.max(4 * items.length, 125);
    console.log(`> mating with ${settings.mutationRate} mutation rate`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      while (mated.length < itemsCount) {
        const j = rand(0, items.length-1);
        if (i === j) { continue; }
        const item1 = item;
        const item2 = items[j];
        mated.push(item1.mate(item2, settings.mutationRate));
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      mated.push(item.clone());
    }

    mated.sort((a, b) => {
      return b.getFitness() - a.getFitness();
    });
    
    // shuffle(mated);

    console.log(`> ${items.length} species mated, new generation is ${mated.length} species`);
    return mated;
  }

  private evaluateRound(leftBat, rightBat, startTime: number): Promise<Bat[]> {
    return new Promise((resolve) => {
      const ball = new Ball({
        canvas: this.canvas,
        leftBat,
        rightBat,
        startTime,
        onFail: (side: BatSideType) => {
          this.stop();
          resolve();
        }
      });
      leftBat.set({
        ball,
        startTime,
        side: BatSideType.Left
      });
      rightBat.set({
        ball,
        startTime,
        side: BatSideType.Right
      });

      this.stop();
      this.play(ball, leftBat, rightBat);
    });
  }

  private play = (ball, leftBat, rightBat) => {
    if (this.isPlaying === false) {
      this.isPlaying = true;
      if (ball) {
        this.roundActive = [leftBat, rightBat, ball]
      }
      this.loop();
    }
  }

  private stop() {
    this.isPlaying = false;
    clearTimeout(this.animationFrame);
  }

  private loop = () => {
    if (this.isPlaying === false) { return; }
    this.canvas.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i < this.roundActive.length; i++) {
      this.roundActive[i].tick(performance.now());
    }
    this.animationFrame = setTimeout(this.loop, 1000 / (60 * settings.speed));
  }
}

new Evolution();

