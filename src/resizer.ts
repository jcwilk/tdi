export class Resizer {
    container: Window;

    // NB: These get set indirectly in the initializer, `0` is just compilershutup
    screenWidth: number = 0;
    screenHeight: number = 0;
    graphWidth: number = 0;
    graphHeight: number = 0;
    _screenSize: number = 0;
    onResize: undefined | Function;

    constructor(container: Window, screenSize: number) {
        this.container = container;
        this.screenSize = screenSize; // implicitly calls update()
        const self = this;
        container.addEventListener("resize", () => {
            self.update();
            if (self.onResize) self.onResize();
        });
    }

    update(): void {
        this.screenWidth = this.container.innerWidth;
        this.screenHeight = this.container.innerHeight;

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
