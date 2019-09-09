export default interface HeimdallNode {
  visitPostOrder(cb: (node: HeimdallNode) => void): void;
  forEachChild(cb: (arg: any) => void): void;
  _slowTrees: { broccoliSelfTime: number };
  
  readonly stats: {
    time: {
      self: number;
    }
  };

  readonly id: { 
    name: string;
    broccoliNode: any;
  };
}