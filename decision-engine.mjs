/**
 * Operational intelligence computed from the real local workspace state.
 * No fake sync status, no fabricated predictions, no simulated OTA webhooks.
 */
import {addDays, nights, isDate} from './hotel.mjs';
import {TYPES, CHANNELS_EXTERNAL, availableCount, allTypeRooms, getRule, rateFor} from './workspace-core.mjs';

const ACTIVE=new Set(['Confirmed','Checked in','Checked out']);
const occOn=(b,day)=>ACTIVE.has(b.status)&&b.checkIn<=day&&day<b.checkOut;
const round=(value,precision=0)=>{
  const factor=10**precision;
  return Math.round((value+Number.EPSILON)*factor)/factor;
};

export function dashboardNumbers(state,start,days=14) {
  if(!isDate(start)||!Number.isInteger(days)||days<1||days>366)throw new Error('Invalid reporting window.');
  const sellable=state.rooms.filter(r=>r.status!=='Maintenance');
  const keys=new Set(sellable.map(r=>r.id));
  const details=[];
  let occupiedRoomNights=0, roomRevenue=0, inventoryRoomNights=0, sellableRoomNights=0, availableRoomNights=0;
  const byChannel=new Map();
  const byType=new Map(TYPES.map(type=>[type,{type,rooms:allTypeRooms(state,type),roomNights:0,revenue:0}]));

  for(let i=0;i<days;i++){
    const day=addDays(start,i);
    // Permanent maintenance and dated blocks both reduce sellable capacity.
    let capacity=0,occupied=0,available=0,revenue=0;
    const booked=state.bookings.filter(b=>occOn(b,day)&&keys.has(b.roomId));
    for(const r of sellable){
      const isBlocked=(state.blocks||[]).some(b=>b.roomId===r.id&&b.start<=day&&day<b.end);
      if(!isBlocked)capacity++;
    }
    for(const b of booked){
      occupied++;
      const nightly=Number(b.rate)||0;
      revenue+=nightly;
      const type=state.rooms.find(r=>r.id===b.roomId)?.type;
      const entry=byType.get(type);
      if(entry){entry.roomNights++;entry.revenue+=nightly;}
      const channel=byChannel.get(b.channel)||{channel:b.channel,roomNights:0,revenue:0,bookings:new Set()};
      channel.roomNights++;channel.revenue+=nightly;channel.bookings.add(b.id);byChannel.set(b.channel,channel);
    }
    available=capacity-occupied;
    if(available<0)throw new Error('Inventory contains overlapping room blocks.');
    details.push({day,capacity,occupied,available,revenue,occupancy:capacity?round(100*occupied/capacity):0});
    occupiedRoomNights+=occupied;
    roomRevenue+=revenue;
    inventoryRoomNights+=capacity;
    sellableRoomNights+=sellable.length;
    availableRoomNights+=available;
  }
  return {
    start,days,rooms:sellable.length,
    occupiedRoomNights,inventoryRoomNights,sellableRoomNights,availableRoomNights,roomRevenue,
    occupancy:inventoryRoomNights?round(100*occupiedRoomNights/inventoryRoomNights,1):0,
    adr:occupiedRoomNights?round(roomRevenue/occupiedRoomNights):0,
    revpar:inventoryRoomNights?round(roomRevenue/inventoryRoomNights):0,
    details,
    channelMix:[...byChannel.values()].map(item=>({...item,bookings:item.bookings.size})).sort((a,b)=>b.revenue-a.revenue),
    roomMix:[...byType.values()].sort((a,b)=>b.revenue-a.revenue)
  };
}
export function mappingAudit(state){
  const entries=[];
  for(const channel of CHANNELS_EXTERNAL){
    for(const type of TYPES){
      const m=state.mappings?.[channel+'|'+type];
      entries.push({
        channel,type,
        mapped:Boolean(m&&typeof m.remoteId==='string'&&m.remoteId.trim()),
        remoteId:m?.remoteId||'',
        adjustment:Number(m?.adjustment||0),
        baseRate:rateFor(state,type,addDays(state.createdAt||'2026-01-01',0))
      });
    }
  }
  const byChannel=CHANNELS_EXTERNAL.map(channel=>{
    const rows=entries.filter(e=>e.channel===channel);
    return {channel,configured:rows.filter(e=>e.mapped).length,required:rows.length,missing:rows.filter(e=>!e.mapped).map(e=>e.type),connection:'No live API connection'};
  });
  return {mapped:entries.filter(x=>x.mapped).length,total:entries.length,entries,byChannel};
}
export function rateComparison(state,day){
  if(!isDate(day))throw new Error('Invalid comparison date.');
  return TYPES.map(type=>{
    const base=rateFor(state,type,day);
    const channels=CHANNELS_EXTERNAL.map(channel=>{
      const m=state.mappings?.[channel+'|'+type];
      const markup=Number(m?.adjustment||0);
      const shown=Math.round(base*(1+markup/100));
      return {channel,rate:shown,spread:shown-base,adjustment:markup,mapped:Boolean(m?.remoteId)};
    });
    return {type,base,channels,available:availableCount(state,type,day),stopSell:getRule(state,type,day).stopSell};
  });
}
export function workQueue(state,day,maxDays=14){
  if(!isDate(day))throw new Error('Invalid work queue date.');
  const tasks=[];
  const arriving=state.bookings.filter(b=>b.status==='Confirmed'&&b.checkIn===day);
  const departing=state.bookings.filter(b=>b.status==='Checked in'&&b.checkOut===day);
  const overdue=state.bookings.filter(b=>b.status==='Checked in'&&b.checkOut<day);
  if(overdue.length)tasks.push({id:'overdue',level:'urgent',title:overdue.length+' checkout'+(overdue.length===1?'':'s')+' overdue',
    body:'Review checked-in guests whose planned departure has passed.',action:'reservations',count:overdue.length});
  if(arriving.length)tasks.push({id:'arrivals',level:'attention',title:arriving.length+' arrival'+(arriving.length===1?'':'s')+' to check in',
    body:'Confirmed reservations scheduled to arrive today.',action:'reservations',count:arriving.length});
  if(departing.length)tasks.push({id:'departures',level:'attention',title:departing.length+' departure'+(departing.length===1?'':'s')+' due',
    body:'Check out guests after completing their stay.',action:'reservations',count:departing.length});
  const map=mappingAudit(state);
  const missing=map.total-map.mapped;
  if(missing){
    const channels=map.byChannel.filter(row=>row.missing.length).map(row=>row.channel+' ('+row.missing.length+')');
    tasks.push({id:'mapping',level:'setup',
      title:missing+' room/rate mappings still need setup',
      body:channels.join(' · ')+'. Review mapping before a future OTA integration.',
      action:'distribution',count:missing});
  }
  // Selling out can be a revenue-management decision, but never imply an OTA sync error.
  const sellouts=[];
  const low=[];
  for(let i=0;i<maxDays;i++){
    const d=addDays(day,i);
    for(const type of TYPES){
      const c=availableCount(state,type,d);
      const sellable=allTypeRooms(state,type);
      if(!sellable||getRule(state,type,d).stopSell)continue;
      if(c===0)sellouts.push({type,day:d});
      else if(c===1)low.push({type,day:d});
    }
  }
  if(sellouts.length)tasks.push({id:'soldout',level:'info',title:sellouts.length+' sold-out room-type date'+(sellouts.length===1?'':'s'),
    body:'No remaining sellable rooms on selected nights. Review the availability matrix.',action:'inventory',count:sellouts.length});
  if(low.length)tasks.push({id:'low',level:'info',title:low.length+' low-inventory room-type date'+(low.length===1?'':'s'),
    body:'Only one room left on selected nights. Check rates and availability.',action:'inventory',count:low.length});
  return tasks.sort((a,b)=>({urgent:0,attention:1,setup:2,info:3}[a.level]-{urgent:0,attention:1,setup:2,info:3}[b.level]));
}
export function scheduledArrivals(state,date,period=7){
  const end=addDays(date,period);
  return state.bookings.filter(b=>b.status==='Confirmed'&&b.checkIn>=date&&b.checkIn<end)
    .sort((a,b)=>a.checkIn.localeCompare(b.checkIn)).slice(0,12);
}
