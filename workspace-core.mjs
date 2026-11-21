import {CHANNELS, STATUSES, iso, addDays, nights, isDate, intersects, createSeed, validateImport} from './hotel.mjs';

export const TYPES = ['Classic','Deluxe','Suite'];
export const SELLABLE = ['Confirmed','Checked in','Checked out'];
export const CHANNELS_EXTERNAL = ['Booking.com','Airbnb','Expedia'];
const KEY = (type,day) => type + '|' + day;
const zero = {rate:null,minStay:1,stopSell:false,cta:false,ctd:false};
const deep = value => JSON.parse(JSON.stringify(value));
const str = (value) => String(value ?? '').trim();
const normal = (date) => isDate(date) ? date : null;
const logs = (state,message) => {
  state.activity.unshift({id:'A-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),at:new Date().toISOString(),message});
  state.activity=state.activity.slice(0,250);
};
export function fresh(day=iso(new Date())) {
  const base=createSeed(day);
  return {...base,workspaceVersion:2,rules:{},mappings:{},blocks:[],activity:[],updatedAt:new Date().toISOString()};
}
export function hydrate(input,day=iso(new Date())) {
  if (!input) return fresh(day);
  let value=deep(input);
  validateImport(value);
  if (value.workspaceVersion && value.workspaceVersion !== 2) throw new Error('Unsupported workspace version.');
  value.workspaceVersion=2;
  value.rules=value.rules && typeof value.rules==='object' && !Array.isArray(value.rules)?value.rules:{};
  value.mappings=value.mappings && typeof value.mappings==='object' && !Array.isArray(value.mappings)?value.mappings:{};
  value.blocks=Array.isArray(value.blocks)?value.blocks:[];
  value.activity=Array.isArray(value.activity)?value.activity:[];
  if (value.blocks.length>25000 || Object.keys(value.rules).length>40000 || value.activity.length>3000) throw new Error('Backup exceeds safe limits.');
  for(const [key,rule] of Object.entries(value.rules)){
    const [type,date]=key.split('|');
    if(!TYPES.includes(type)||!isDate(date)||key!==KEY(type,date)||!validRule(rule))throw new Error('Backup has invalid rate/restriction data.');
  }
  for(const b of value.blocks){
    if(!b.id||!value.rooms.some(room=>room.id===b.roomId)||!isDate(b.start)||!isDate(b.end)||nights(b.start,b.end)<1)throw new Error('Backup has invalid room blocks.');
  }
  for(const [key,m] of Object.entries(value.mappings)){
    const [channel,type]=key.split('|');
    if(!CHANNELS_EXTERNAL.includes(channel)||!TYPES.includes(type)||key!==channel+'|'+type||
      typeof m.remoteId!=='string'||m.remoteId.length>100||
      !Number.isFinite(Number(m.adjustment))||Number(m.adjustment)<-99||Number(m.adjustment)>500) throw new Error('Backup has invalid channel mapping.');
  }
  const knownRefs=new Set();
  for(const b of value.bookings){
    if(b.externalRef){
      const ref=b.channel+'|'+String(b.externalRef).trim();
      if(knownRefs.has(ref))throw new Error('Duplicate external reservation reference in backup.');
      knownRefs.add(ref);
    }
  }
  return value;
}
function validRule(rule) {
  return rule && typeof rule==='object' &&
    (rule.rate==null||(Number.isFinite(Number(rule.rate))&&Number(rule.rate)>=0&&Number(rule.rate)<=100000000)) &&
    Number.isInteger(Number(rule.minStay))&&Number(rule.minStay)>=1&&Number(rule.minStay)<=90 &&
    ['stopSell','cta','ctd'].every(key=>typeof rule[key]==='boolean');
}
export function getRule(state,type,day){
  const r=state.rules?.[KEY(type,day)];
  return {...zero,...(r||{})};
}
export function roomType(state,id){return state.rooms.find(r=>r.id===id)?.type;}
export function rateFor(state,type,day){
  const room=state.rooms.find(r=>r.type===type);
  return getRule(state,type,day).rate ?? (room?.rate||0);
}
export function availableRooms(state,type,day) {
  if(!TYPES.includes(type)||!isDate(day))return [];
  return state.rooms.filter(room=>room.type===type && room.status!=='Maintenance' &&
    !state.bookings.some(b=>b.roomId===room.id && b.status!=='Cancelled'&&b.checkIn<=day&&day<b.checkOut) &&
    !(state.blocks||[]).some(b=>b.roomId===room.id && b.start<=day && day<b.end));
}
export const availableCount=(state,type,day)=>availableRooms(state,type,day).length;
export const allTypeRooms=(state,type)=>state.rooms.filter(r=>r.type===type&&r.status!=='Maintenance').length;
export function isSellable(state,type,day) {
  return availableCount(state,type,day)>0 && !getRule(state,type,day).stopSell;
}
export function quoteStay(state,type,start,end) {
  if(!TYPES.includes(type)||!isDate(start)||!isDate(end)||nights(start,end)<1) return null;
  let total=0;
  for(let day=start;day<end;day=addDays(day,1))total+=rateFor(state,type,day);
  return total;
}
export function validateStay(state,booking,exceptId=null) {
  if(!booking.guest||str(booking.guest).length<2)return 'Enter a guest name.';
  if(!isDate(booking.checkIn)||!isDate(booking.checkOut)||nights(booking.checkIn,booking.checkOut)<1||nights(booking.checkIn,booking.checkOut)>90)return 'Choose a valid stay between 1 and 90 nights.';
  if(!state.rooms.some(r=>r.id===booking.roomId))return 'Choose a room.';
  if(!CHANNELS.includes(booking.channel))return 'Unknown reservation source.';
  if(!STATUSES.includes(booking.status))return 'Unknown reservation status.';
  if(!Number.isInteger(Number(booking.guests))||Number(booking.guests)<1||Number(booking.guests)>8)return 'Guest count must be between 1 and 8.';
  if(booking.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email))return 'Enter a valid email address.';
  if(booking.status==='Cancelled')return null;
  const room=state.rooms.find(r=>r.id===booking.roomId);
  if(room.status==='Maintenance')return 'This room is in maintenance.';
  const atArrival=getRule(state,room.type,booking.checkIn);
  const atDeparture=getRule(state,room.type,booking.checkOut);
  if(nights(booking.checkIn,booking.checkOut)<atArrival.minStay)return 'Minimum stay is '+atArrival.minStay+' nights.';
  if(atArrival.cta)return 'Arrival is closed on this date.';
  if(atDeparture.ctd)return 'Departure is closed on this date.';
  for(let day=booking.checkIn;day<booking.checkOut;day=addDays(day,1)){
    if(getRule(state,room.type,day).stopSell)return 'Sales are closed for '+day+'.';
  }
  if(state.bookings.some(b=>b.id!==exceptId&&b.status!=='Cancelled'&&b.roomId===booking.roomId&&intersects(b.checkIn,b.checkOut,booking.checkIn,booking.checkOut))) return 'Room is already reserved for these dates.';
  if(state.blocks.some(b=>b.roomId===booking.roomId&&intersects(b.start,b.end,booking.checkIn,booking.checkOut)))return 'Room is blocked for maintenance during these dates.';
  if(booking.externalRef&&state.bookings.some(b=>b.id!==exceptId&&b.channel===booking.channel&&b.externalRef===booking.externalRef)) return 'Duplicate channel reservation reference.';
  return null;
}
export function reserve(state,booking,exceptId=null) {
  const next=deep(state);
  const err=validateStay(next,booking,exceptId);
  if(err) throw new Error(err);
  const target=exceptId?next.bookings.find(b=>b.id===exceptId):null;
  if(exceptId&&!target)throw new Error('Reservation no longer exists.');
  const room=next.rooms.find(r=>r.id===booking.roomId);
  const row={...target,...booking,id:exceptId||'RS-'+Math.max(1001,...next.bookings.map(b=>Number(String(b.id).replace(/\D/g,''))||1000)+1), 
    guest:str(booking.guest), guests:Number(booking.guests), rate:Number(booking.rate??(getRule(next,room.type,booking.checkIn).rate??room.rate)), createdAt:target?.createdAt||iso(new Date())};
  if(target){Object.assign(target,row);} else next.bookings.push(row);
  logs(next,(exceptId?'Updated reservation ':'Created reservation ')+row.id+' · '+row.guest);
  return next;
}
export function changeStatus(state,id,status) {
  if(!STATUSES.includes(status))throw new Error('Unknown status.');
  const target=state.bookings.find(b=>b.id===id);if(!target)throw new Error('Reservation not found.');
  const next=deep(state);const row=next.bookings.find(b=>b.id===id);
  if(status==='Checked in'&&row.status!=='Confirmed')throw new Error('Only confirmed guests can check in.');
  if(status==='Checked out'&&row.status!=='Checked in')throw new Error('Check in the guest first.');
  if(status==='Cancelled'&&row.status==='Checked out')throw new Error('Completed stays cannot be cancelled.');
  if(status==='Confirmed'&&row.status==='Cancelled'){const err=validateStay(next,{...row,status:'Confirmed'},row.id);if(err)throw new Error(err);}
  row.status=status;
  logs(next,status+' · '+id+' · '+row.guest);
  return next;
}
export function bulkRule(state,{type,from,to,rate,minStay,stopSell,cta,ctd}) {
  if(!TYPES.includes(type))throw new Error('Choose a valid room type.');
  if(!isDate(from)||!isDate(to)||from>to||nights(from,addDays(to,1))>366)throw new Error('Choose a valid date range of up to 366 days.');
  if(rate!==''&&rate!==null&&rate!==undefined&&(!Number.isFinite(Number(rate))||Number(rate)<0||Number(rate)>100000000))throw new Error('Invalid nightly rate.');
  if(!Number.isInteger(Number(minStay))||Number(minStay)<1||Number(minStay)>90)throw new Error('Minimum stay must be 1–90 nights.');
  const next=deep(state);
  for(let day=from;day<=to;day=addDays(day,1)){
    const prev=getRule(next,type,day);
    next.rules[KEY(type,day)]={...prev,rate:rate===''||rate===null||rate===undefined?null:Number(rate),
      minStay:Number(minStay),stopSell:!!stopSell,cta:!!cta,ctd:!!ctd};
  }
  logs(next,'Updated '+type+' pricing and restrictions · '+from+' to '+to);
  return next;
}
export function updateRoom(state,{roomId,name,rate,status},today=iso(new Date())) {
  const current=state.rooms.find(r=>r.id===roomId);
  if(!current)throw new Error('Room not found.');
  const cleanName=str(name);
  if(cleanName.length<2||cleanName.length>70)throw new Error('Room name must be 2–70 characters.');
  const amount=Number(rate);
  if(!Number.isFinite(amount)||amount<0||amount>100000000)throw new Error('Enter a valid nightly rate.');
  if(!['Ready','Maintenance'].includes(status))throw new Error('Invalid room status.');
  if(status==='Maintenance'&&state.bookings.some(b=>b.roomId===roomId&&b.status!=='Cancelled'&&b.checkOut>today)){
    throw new Error('The room has upcoming or in-house reservations. Move or cancel them first.');
  }
  const next=deep(state);
  const target=next.rooms.find(r=>r.id===roomId);
  target.name=cleanName;target.rate=amount;target.status=status;
  logs(next,'Updated room '+roomId+' · '+cleanName+' · '+status);
  return next;
}
export function blockRoom(state,{roomId,start,end,reason}) {
  if(!state.rooms.some(r=>r.id===roomId))throw new Error('Unknown room.');
  if(!isDate(start)||!isDate(end)||nights(start,end)<1)throw new Error('Invalid block dates.');
  if(state.bookings.some(b=>b.status!=='Cancelled'&&b.roomId===roomId&&intersects(start,end,b.checkIn,b.checkOut)))throw new Error('Move or cancel existing reservations before blocking this room.');
  if((state.blocks||[]).some(b=>b.roomId===roomId&&intersects(start,end,b.start,b.end)))throw new Error('Room already blocked for these dates.');
  const next=deep(state);
  next.blocks.push({id:'BL-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),roomId,start,end,reason:str(reason).slice(0,150)||'Maintenance'});
  logs(next,'Blocked room '+roomId+' · '+start+' to '+end);
  return next;
}
export function unblock(state,id){
  const next=deep(state);
  const before=next.blocks.length;next.blocks=next.blocks.filter(b=>b.id!==id);
  if(next.blocks.length===before)throw new Error('Block not found.');
  logs(next,'Removed room block '+id);
  return next;
}
export function channelMap(state,channel,type,remoteId,adjustment=0) {
  if(!CHANNELS_EXTERNAL.includes(channel)||!TYPES.includes(type))throw new Error('Invalid channel or room type.');
  if(str(remoteId).length>100)throw new Error('Channel rate plan ID too long.');
  if(!Number.isFinite(Number(adjustment))||Number(adjustment)<-99||Number(adjustment)>500)throw new Error('Markup must be between -99% and 500%.');
  const next=deep(state);
  next.mappings[channel+'|'+type]={remoteId:str(remoteId),adjustment:Number(adjustment)};
  logs(next,'Saved local mapping · '+channel+' / '+type);
  return next;
}
export function feedRows(state,channel,from,days=14) {
  if(!CHANNELS_EXTERNAL.includes(channel)||!isDate(from)||days<1||days>366)throw new Error('Invalid channel feed selection.');
  const rows=[];
  for(const type of TYPES){
    const mapping=state.mappings[channel+'|'+type]||{remoteId:'',adjustment:0};
    for(let i=0;i<days;i++){
      const day=addDays(from,i);const rule=getRule(state,type,day);
      rows.push({channel,roomType:type,remoteId:mapping.remoteId,date:day,
        available:rule.stopSell?0:availableCount(state,type,day),
        rate:Math.round(rateFor(state,type,day)*(1+Number(mapping.adjustment||0)/100)),
        minStay:rule.minStay,stopSell:rule.stopSell?'yes':'no',cta:rule.cta?'yes':'no',ctd:rule.ctd?'yes':'no'});
    }
  }
  return rows;
}
function csvCell(s) {
  let value=String(s??''); if(/^[=+\-@\t\r]/.test(value)) value="'"+value;
  return '"'+value.replaceAll('"','""')+'"';
}
export function toCSV(rows){
  if(!rows.length)return '';
  const columns=Object.keys(rows[0]);
  return [columns.map(csvCell).join(','),...rows.map(row=>columns.map(k=>csvCell(row[k])).join(','))].join('\r\n');
}
export function parseCSV(text) {
  const rows=[];let cell='',row=[],q=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(q&&char==='"'&&text[i+1]==='"'){cell+='"';i++;continue;}
    if(char==='"'){q=!q;continue;}
    if(!q&&(char===','||char==='\n'||char==='\r')){
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(char!==','){if(row.some(value=>str(value)))rows.push(row);row=[];}
      continue;
    }
    cell+=char;
  }
  if(q)throw new Error('Unterminated CSV quoted field.');
  row.push(cell);if(row.some(value=>str(value)))rows.push(row);
  return rows;
}
export const BOOKING_FIELDS=['channel','externalRef','guest','checkIn','checkOut','roomType','email','guests'];
export function importPreview(state,text){
  const rows=parseCSV(text);if(rows.length<2)throw new Error('CSV must contain a header and at least one reservation.');
  if(rows.length>502)throw new Error('Import at most 500 reservations at once.');
  const head=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim());
  if(BOOKING_FIELDS.some(field=>!head.includes(field)))throw new Error('Expected columns: '+BOOKING_FIELDS.join(', '));
  let staged=deep(state), accepted=[],rejected=[];
  for(let i=1;i<rows.length;i++){
    const obj=Object.fromEntries(BOOKING_FIELDS.map(name=>[name,rows[i][head.indexOf(name)]]));
    obj.guests=Number(obj.guests);obj.status='Confirmed';
    const ids=availableCandidateIds(staged,obj.roomType,obj.checkIn,obj.checkOut);
    const id=ids[0];if(id)obj.roomId=id;
    const error=!id?'No free room matching that type, dates or restrictions.':validateStay(staged,obj);
    if(error){rejected.push({line:i+1,guest:str(obj.guest),error});continue;}
    try{
      staged=reserve(staged,{...obj,rate:rateFor(staged,obj.roomType,obj.checkIn)});
      accepted.push({line:i+1,guest:obj.guest,roomId:id});
    }catch(err){rejected.push({line:i+1,guest:str(obj.guest),error:err.message});}
  }
  return {accepted,rejected,staged};
}
export function availableCandidateIds(state,type,start,end){
  if(!TYPES.includes(type)||!isDate(start)||!isDate(end)||nights(start,end)<1)return [];
  return state.rooms.filter(r=>r.type===type&&validateStay(state,{guest:'Sample Guest',roomId:r.id,checkIn:start,checkOut:end,
    channel:'Direct',status:'Confirmed',guests:1,email:''})===null).map(r=>r.id);
}
export function sampleCSV() {
  return BOOKING_FIELDS.join(',')+'\nBooking.com,BKG-EXAMPLE-001,Test Guest,2027-03-15,2027-03-18,Classic,test@example.com,2';
}
