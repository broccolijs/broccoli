import { BrocfileOptions } from '../../../lib';
import Source = require('broccoli-source');
const subdir: string = 'subdir';

export default (options: BrocfileOptions) => new Source.UnwatchedDir(subdir);
