'use strict';
require('dotenv').config();
process.env.FROTASYS_INTERFACE_BETA = require('./mode').betaMode(process.env);
require('../server');
