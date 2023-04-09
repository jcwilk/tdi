export class Resizer {
    container: Window;
    canvas: HTMLCanvasElement;

    // NB: These get set indirectly in the initializer, `0` is just compilershutup
    screenWidth: number = 0;
    screenHeight: number = 0;
    graphWidth: number = 0;
    graphHeight: number = 0;
    _screenSize: number = 0;
    onResize: undefined | Function;

    constructor(container: Window, canvas: HTMLCanvasElement, screenSize: number) {
        this.container = container;
        this.canvas = canvas;
        this.screenSize = screenSize;
        const self = this;
        container.addEventListener("resize", () => {
            self.update();
            if (self.onResize) self.onResize();
        });

        // update() is implicitly called but let's call it explicitly just in case
        this.update();
    }

    update(): void {
        this.screenWidth = this.container.innerWidth;
        this.screenHeight = this.container.innerHeight;

        // Update the canvas width and height to match the screen dimensions
        this.canvas.width = this.screenWidth;
        this.canvas.height = this.screenHeight;

        if (this.isPortrait()) {
            this.graphWidth = this.screenSize;
            this.graphHeight = (this.screenSize * this.screenHeight) / this.screenWidth;
        } else {
            this.graphWidth = (this.screenSize * this.screenWidth) / this.screenHeight;
            this.graphHeight = this.screenSize;
        }
    }

    set screenSize(screenSize: number) {
        this._screenSize = screenSize;
        this.update();
    }

    get screenSize() {
        return this._screenSize;
    }

    isPortrait(): boolean {
        return this.screenWidth < this.screenHeight;
    }
}
