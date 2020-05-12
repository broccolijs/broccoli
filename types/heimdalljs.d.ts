export interface HeimdallNode {
  visitPostOrder(cb: (node: HeimdallNode) => void): void;
  forEachChild(cb: (arg: any) => void): void;
  start(arg: any): HeimdallNode;
  stop(): void;

  _children: [HeimdallNode];
  _slowTrees: { broccoliSelfTime: number };

  readonly stats: {
    time: {
      self: number;
      total: number;
    };
  };

  readonly current: HeimdallNode;

  readonly id: {
    name: string;
    broccoliNode: any;
  };
}

export const HeimdallNode: HeimdallNode;
export default HeimdallNode;
