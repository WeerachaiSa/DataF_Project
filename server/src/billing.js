// Integer satang avoids binary floating-point errors; PostgreSQL NUMERIC is authoritative.
export function calculateBill({ rent, previousWater, currentWater, previousElectric, currentElectric, waterRate=18, electricRate=8 }) {
 const values=[rent,previousWater,currentWater,previousElectric,currentElectric,waterRate,electricRate];
 if(values.some(v=>!Number.isFinite(v)||v<0)||currentWater<previousWater||currentElectric<previousElectric) throw new RangeError('Invalid billing values');
 const rentSatang=Math.round(rent*100),waterSatang=Math.round((currentWater-previousWater)*waterRate*100),electricSatang=Math.round((currentElectric-previousElectric)*electricRate*100);
 return {rent_amount:rentSatang/100,water_amount:waterSatang/100,electric_amount:electricSatang/100,total_amount:(rentSatang+waterSatang+electricSatang)/100};
}

