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

  private isHeaderElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    return /^h[1-9]$/.test(tagName);
  }

  private countWords(element: HTMLElement): number {
    let totalWords = 0;

    if (this.isHeaderElement(element)) {
      return totalWords;
    }

    if (element instanceof HTMLInputElement && element.type === 'text') {
      totalWords += (element.value || '').trim().split(/\s+/).length;
    } else if (element.nodeType === Node.TEXT_NODE) {
      totalWords += (element.textContent || '').trim().split(/\s+/).length;
    }

    for (const child of Array.from(element.childNodes)) {
      if (child instanceof HTMLElement) {
        totalWords += this.countWords(child);
      } else if (child.nodeType === Node.TEXT_NODE) {
        totalWords += (child.textContent || '').trim().split(/\s+/).length;
      }
    }

    return totalWords;
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
