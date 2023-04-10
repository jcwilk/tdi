type Coordinate = {
  x: number;
  y: number;
};

export class WordCounter {
  private root: HTMLElement;
  private currentCoordinate: Coordinate;
  private alpha: number;

  constructor(root: HTMLElement, alpha: number = 0.02) {
    this.root = root;
    this.alpha = alpha;
    this.currentCoordinate = { x: 0, y: 0 };
  }

  private countWords(element: HTMLInputElement): number {
    const value = (element.value || '').trim();
    return value ? value.split(/\s+/).length : 0;
  }

  private static easeSqrt(value: number): number {
    return Math.sqrt(value);
  }

  private static generateSpiralCoordinates(count: number): Coordinate {
    const t = count * 0.01;
    const r = WordCounter.easeSqrt(t);
    const angle = 2 * Math.PI * r;

    const x = 0.75 * r * Math.cos(angle);
    const y = 0.75 * r * Math.sin(angle);

    return { x, y };
  }

  private applyEmaSmoothing(newCoordinate: Coordinate, snapThreshold = 0.001): Coordinate {
    const x = this.alpha * newCoordinate.x + (1 - this.alpha) * this.currentCoordinate.x;
    const y = this.alpha * newCoordinate.y + (1 - this.alpha) * this.currentCoordinate.y;

    const deltaX = Math.abs(x - newCoordinate.x);
    const deltaY = Math.abs(y - newCoordinate.y);

    if (deltaX <= snapThreshold && deltaY <= snapThreshold) {
      return newCoordinate;
    }

    return { x, y };
  }


  public getCoordinate(): Coordinate {
    const wordCount = this.countWords(this.root);
    const newCoordinate = WordCounter.generateSpiralCoordinates(wordCount);
    this.currentCoordinate = this.applyEmaSmoothing(newCoordinate);

    return this.currentCoordinate;
  }
}
