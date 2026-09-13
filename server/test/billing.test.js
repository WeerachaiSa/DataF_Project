import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBill} from '../src/billing.js';
test('seeded single room: rent + 6 water units + 60 electric units',()=>{
 assert.deepEqual(calculateBill({rent:3000,previousWater:100,currentWater:106,previousElectric:500,currentElectric:560}),{rent_amount:3000,water_amount:108,electric_amount:480,total_amount:3588});
});
test('twin room, zero usage, and decimal readings round to satang',()=>{
 assert.equal(calculateBill({rent:4000,previousWater:1,currentWater:1,previousElectric:5,currentElectric:5}).total_amount,4000);
 assert.equal(calculateBill({rent:3000,previousWater:10.1,currentWater:10.4,previousElectric:0,currentElectric:.1,waterRate:18,electricRate:8}).total_amount,3006.2);
});
test('negative deltas and invalid amounts cannot generate a bill',()=>{
 for(const currentWater of [99,-1,NaN,Infinity])assert.throws(()=>calculateBill({rent:3000,previousWater:100,currentWater,previousElectric:0,currentElectric:10}),RangeError);
});


