const path = require('node:path');
const root = path.resolve(__dirname, '../../dictionaries');
const catalog = require(path.join(root, 'library.json'));
module.exports = [...catalog.word_libraries, ...catalog.naming_libraries].map(p => path.join(root,p));
