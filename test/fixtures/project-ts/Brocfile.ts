import { BrocfileOptions } from '../../../lib';
import Source = require('broccoli-source');
const subdir: string = 'subdir';

export default (_options: BrocfileOptions) => new Source.UnwatchedDir(subdir);
