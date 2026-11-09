// Virtual orchard crops. Timings and rewards describe the game, not real farming.
const fruit=(id,en,he,days,cost,yieldCount,sell,xp,regrowDays,cycles,food='garden-fruit')=>({id,en,he,zone:'orchard',days,seedCost:cost,seedlingCost:cost+3,yield:yieldCount,sell,xp,regrowDays,cycles,food});
export const GARDEN_ORCHARD_CROPS=[
 fruit('apple-tree','Apple tree','עץ תפוח',4,6,4,1,12,2,6,'apple'),
 fruit('banana-plant','Banana plant','בננה',3,5,3,1,10,2,4),
 fruit('pineapple-plant','Pineapple plant','אננס',3,5,2,2,10,2,2),
 fruit('orange-tree','Orange tree','עץ תפוז',4,6,4,1,12,2,6),
 fruit('lemon-tree','Lemon tree','עץ לימון',3,5,4,1,10,2,6),
 fruit('pear-tree','Pear tree','עץ אגס',4,6,4,1,12,2,6),
];
export const GARDEN_ORCHARD_START=3,GARDEN_ORCHARD_MAX=6;
