#!/usr/bin/env ts-node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
// Ensure environment variables (.env.local) are loaded when running outside Next.js runtime
require("dotenv/config");
var db_1 = require("@/lib/db");
var types_1 = require("@/models/types");
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var col, MIN_PER_CAT, existingCounts, countMap, docs, sampleBank, _i, CATEGORIES_1, cat, have, needed, bank, i, sample;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, db_1.getCollection)('questions')];
                case 1:
                    col = _a.sent();
                    MIN_PER_CAT = 5;
                    return [4 /*yield*/, col.aggregate([
                            { $group: { _id: '$category', count: { $sum: 1 } } }
                        ]).toArray()];
                case 2:
                    existingCounts = _a.sent();
                    countMap = new Map(existingCounts.map(function (e) { return [e._id, e.count]; }));
                    docs = [];
                    sampleBank = {
                        'Literature': [
                            { text: 'Who wrote "1984"?', choices: ['George Orwell', 'Aldous Huxley', 'Ray Bradbury', 'J.R.R. Tolkien'], correctIndex: 0 },
                            { text: 'Shakespeare tragedy featuring Hamlet is set in which country?', choices: ['Denmark', 'England', 'Italy', 'France'], correctIndex: 0 },
                            { text: 'The Odyssey is attributed to which poet?', choices: ['Homer', 'Virgil', 'Sophocles', 'Plato'], correctIndex: 0 },
                            { text: 'Author of "Pride and Prejudice"?', choices: ['Jane Austen', 'Emily Brontë', 'Mary Shelley', 'Virginia Woolf'], correctIndex: 0 },
                            { text: 'Genre of "The Hobbit"?', choices: ['Fantasy', 'Romance', 'Historical', 'Satire'], correctIndex: 0 },
                        ],
                        'Culture': [
                            { text: 'Origami is traditional paper folding from which country?', choices: ['Japan', 'China', 'Korea', 'Thailand'], correctIndex: 0 },
                            { text: 'Diwali is a festival of lights in which religion?', choices: ['Hinduism', 'Buddhism', 'Christianity', 'Judaism'], correctIndex: 0 },
                            { text: 'The Louvre Museum is located in which city?', choices: ['Paris', 'Rome', 'London', 'Madrid'], correctIndex: 0 },
                            { text: 'Tango dance originated in?', choices: ['Argentina', 'Spain', 'Brazil', 'Mexico'], correctIndex: 0 },
                            { text: 'Sushi primarily features what key ingredient?', choices: ['Rice', 'Wheat', 'Corn', 'Barley'], correctIndex: 0 },
                        ],
                        'General Knowledge': [
                            { text: 'How many continents are there?', choices: ['7', '5', '6', '8'], correctIndex: 0 },
                            { text: 'Primary color NOT in RGB?', choices: ['Yellow', 'Red', 'Green', 'Blue'], correctIndex: 0 },
                            { text: 'How many days in a leap year?', choices: ['366', '365', '364', '367'], correctIndex: 0 },
                            { text: 'Tallest mammal?', choices: ['Giraffe', 'Elephant', 'Moose', 'Rhino'], correctIndex: 0 },
                            { text: 'Instrument with keys, pedals, and strings?', choices: ['Piano', 'Guitar', 'Violin', 'Flute'], correctIndex: 0 },
                        ],
                        'History': [
                            { text: 'Who was the first President of the USA?', choices: ['George Washington', 'Abraham Lincoln', 'John Adams', 'Thomas Jefferson'], correctIndex: 0 },
                            { text: 'The Roman Empire fell in (Western) year?', choices: ['476 AD', '1066 AD', '1492 AD', '800 AD'], correctIndex: 0 },
                            { text: 'The Magna Carta signed in which country?', choices: ['England', 'France', 'Germany', 'Spain'], correctIndex: 0 },
                            { text: 'Pyramids of Giza are in which country?', choices: ['Egypt', 'Mexico', 'Peru', 'China'], correctIndex: 0 },
                            { text: 'Explorer who reached the Americas in 1492?', choices: ['Christopher Columbus', 'Marco Polo', 'Ferdinand Magellan', 'James Cook'], correctIndex: 0 },
                        ],
                        'Nature': [
                            { text: 'Photosynthesis primarily occurs in which plant cell organelle?', choices: ['Chloroplast', 'Mitochondrion', 'Nucleus', 'Ribosome'], correctIndex: 0 },
                            { text: 'Largest land carnivore?', choices: ['Polar Bear', 'Lion', 'Kodiak Bear', 'Tiger'], correctIndex: 0 },
                            { text: 'Desert known as the largest hot desert?', choices: ['Sahara', 'Gobi', 'Kalahari', 'Mojave'], correctIndex: 0 },
                            { text: 'Bee-produced substance used as food?', choices: ['Honey', 'Royal Jelly', 'Wax', 'Propolis'], correctIndex: 0 },
                            { text: 'Process of water vapor becoming liquid?', choices: ['Condensation', 'Evaporation', 'Sublimation', 'Precipitation'], correctIndex: 0 },
                        ],
                        'Sport': [
                            { text: 'Number of players on a standard soccer team on the field?', choices: ['11', '10', '12', '9'], correctIndex: 0 },
                            { text: 'Olympic Games occur every ___ years.', choices: ['4', '2', '3', '5'], correctIndex: 0 },
                            { text: 'Grand Slam tournament played on clay?', choices: ['French Open', 'Wimbledon', 'US Open', 'Australian Open'], correctIndex: 0 },
                            { text: 'Basketball originated in which country?', choices: ['USA', 'Canada', 'UK', 'Australia'], correctIndex: 0 },
                            { text: 'Term for a score of one under par in golf?', choices: ['Birdie', 'Eagle', 'Par', 'Bogey'], correctIndex: 0 },
                        ],
                        'Geography': [
                            { text: 'Capital of Japan?', choices: ['Tokyo', 'Kyoto', 'Osaka', 'Nagoya'], correctIndex: 0 },
                            { text: 'River flowing through Egypt?', choices: ['Nile', 'Amazon', 'Danube', 'Yangtze'], correctIndex: 0 },
                            { text: 'Mount Everest lies on the border of Nepal and?', choices: ['China', 'India', 'Bhutan', 'Pakistan'], correctIndex: 0 },
                            { text: 'Largest ocean?', choices: ['Pacific', 'Atlantic', 'Indian', 'Arctic'], correctIndex: 0 },
                            { text: 'Desert covering much of northern Africa?', choices: ['Sahara', 'Gobi', 'Patagonia', 'Great Victoria'], correctIndex: 0 },
                        ],
                        'Science': [
                            { text: 'H2O is the chemical formula for?', choices: ['Water', 'Hydrogen peroxide', 'Ozone', 'Salt'], correctIndex: 0 },
                            { text: 'Speed of light approx (km/s)?', choices: ['300000', '150000', '186000', '100000'], correctIndex: 0 },
                            { text: 'Gas plants absorb for photosynthesis?', choices: ['Carbon Dioxide', 'Nitrogen', 'Oxygen', 'Methane'], correctIndex: 0 },
                            { text: 'Unit of electric current?', choices: ['Ampere', 'Volt', 'Ohm', 'Watt'], correctIndex: 0 },
                            { text: 'Force that keeps planets in orbit?', choices: ['Gravity', 'Magnetism', 'Friction', 'Inertia'], correctIndex: 0 },
                        ],
                        'Random': [
                            { text: 'Wildcard squares can draw from which set?', choices: ['All other categories', 'Only Science', 'Only Sport', 'Only Literature'], correctIndex: 0 },
                            { text: 'Random category stands for?', choices: ['Wildcard', 'Specific topic', 'Math only', 'Geology only'], correctIndex: 0 },
                            { text: 'Purpose of Random squares?', choices: ['Variety', 'Remove challenge', 'Guarantee win', 'Skip turn'], correctIndex: 0 },
                            { text: 'Random selection should be?', choices: ['Unbiased', 'Biased', 'Predictable', 'Fixed'], correctIndex: 0 },
                            { text: 'Fallback if no DB questions?', choices: ['Use sample', 'Throw error', 'Crash', 'Return null'], correctIndex: 0 },
                        ],
                    };
                    for (_i = 0, CATEGORIES_1 = types_1.CATEGORIES; _i < CATEGORIES_1.length; _i++) {
                        cat = CATEGORIES_1[_i];
                        have = countMap.get(cat) || 0;
                        if (have >= MIN_PER_CAT)
                            continue;
                        needed = MIN_PER_CAT - have;
                        bank = sampleBank[cat] || [];
                        for (i = 0; i < needed; i++) {
                            sample = bank[i % bank.length] || {
                                text: "".concat(cat, " sample question ").concat(have + i + 1, "?"),
                                choices: ['Option A', 'Option B', 'Option C', 'Option D'],
                                correctIndex: 0,
                            };
                            docs.push({
                                category: cat,
                                text: sample.text,
                                choices: sample.choices,
                                correctIndex: sample.correctIndex,
                                language: 'en',
                            });
                        }
                    }
                    if (!docs.length) return [3 /*break*/, 4];
                    return [4 /*yield*/, col.insertMany(docs)];
                case 3:
                    _a.sent();
                    console.log('Inserted', docs.length, 'new questions to backfill categories.');
                    return [3 /*break*/, 5];
                case 4:
                    console.log('All categories already meet minimum question count. No inserts.');
                    _a.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) { console.error(e); process.exit(1); }).finally(function () { return (0, db_1.closeDb)(); });
