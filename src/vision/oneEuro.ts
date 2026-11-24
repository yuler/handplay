/**
 * One Euro Filter (Casiez et al., CHI 2012)
 * Adaptive low-pass filter: rock-solid when still, ultra-low lag during fast movement.
 */
export class OneEuroFilterArray {
  private x: Float32Array;
  private dx: Float32Array;
  private initialized = false;

  constructor(
    size: number,
    private readonly minCutoff = 1.6,
    private readonly beta = 5.0,
    private readonly dCutoff = 1.2,
  ) {
    this.x = new Float32Array(size);
    this.dx = new Float32Array(size);
  }

  reset() {
    this.initialized = false;
    this.dx.fill(0);
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(input: Float32Array, output: Float32Array, dtSec: number) {
    const dt = Math.max(0.004, Math.min(0.15, dtSec));
    if (!this.initialized) {
      for (let i = 0; i < input.length; i++) {
        this.x[i] = input[i];
        output[i] = input[i];
      }
      this.dx.fill(0);
      this.initialized = true;
      return;
    }

    const aD = OneEuroFilterArray.alpha(this.dCutoff, dt);
    for (let i = 0; i < input.length; i++) {
      const d = (input[i] - this.x[i]) / dt;
      this.dx[i] += aD * (d - this.dx[i]);
      const cutoff = this.minCutoff + this.beta * Math.abs(this.dx[i]);
      const a = OneEuroFilterArray.alpha(cutoff, dt);
      this.x[i] += a * (input[i] - this.x[i]);
      output[i] = this.x[i];
    }
  }
}
