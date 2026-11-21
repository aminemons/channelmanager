import {isDate,nights} from './hotel.mjs';
import {CHANNELS_EXTERNAL,reserve} from './workspace-core.mjs';

function isoDate(token) {
  const s=String(token||'').trim();
  if(!/^\d{8}$/.test(s)) return null;
  const date=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
  return isDate(date)?date:null;
}
function icsDate(date){return date.replaceAll('-','');}
export function readICal(text){
  if(typeof text!=='string'||text.length>2000000)throw new Error('Calendar file is too large.');
  const lines=text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/);
  if(!lines.some(x=>x.trim()==='BEGIN:VCALENDAR'))throw new Error('Not an iCalendar file.');
  const events=[];let cur=null;
  for(const line of lines){
    if(line.trim()==='BEGIN:VEVENT'){if(cur)throw new Error('Nested calendar event.');cur={};continue;}
    if(line.trim()==='END:VEVENT'){if(!cur)throw new Error('Invalid event closing tag.');events.push(cur);cur=null;continue;}
    if(!cur)continue;
    const p=line.indexOf(':');if(p<0)continue;
    const key=line.slice(0,p).split(';')[0].toUpperCase();
    if(['UID','DTSTART','DTEND','SUMMARY','STATUS'].includes(key))cur[key]=line.slice(p+1).trim();
  }
  if(cur)throw new Error('Incomplete calendar event.');
  if(events.length>500)throw new Error('Import at most 500 calendar events at once.');
  return events;
}
export function iCalImportPreview(state,text,roomId,channel='Airbnb'){
  if(!CHANNELS_EXTERNAL.includes(channel))throw new Error('Choose a supported booking channel.');
  if(!state.rooms.some(r=>r.id===roomId))throw new Error('Choose a valid room.');
  const events=readICal(text);if(!events.length)throw new Error('No calendar events found.');
  let staged=structuredClone(state),accepted=[],rejected=[];
  for(let i=0;i<events.length;i++){
    const ev=events[i],start=isoDate(ev.DTSTART),end=isoDate(ev.DTEND);
    if(ev.STATUS==='CANCELLED')continue;
    const uid=String(ev.UID||'').slice(0,120);
    if(!uid||!start||!end||nights(start,end)<1||nights(start,end)>90){
      rejected.push({line:i+1,error:'Missing UID or unsupported calendar dates. Only date-based events lasting 1–90 nights are accepted.'});continue;
    }
    const item={guest:'External calendar hold',roomId,checkIn:start,checkOut:end,channel,
      externalRef:'ICAL:'+uid,guests:1,email:'',status:'Confirmed'};
    try{
      staged=reserve(staged,item);
      accepted.push({line:i+1,uid,start,end});
    }catch(e){rejected.push({line:i+1,error:e.message||'Event conflicts with existing availability.'});}
  }
  return {accepted,rejected,staged};
}
export function writeICal(state,roomId){
  if(!state.rooms.some(r=>r.id===roomId))throw new Error('Unknown room.');
  const rows=[];
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const add=(id,start,end)=>rows.push([
    'BEGIN:VEVENT','UID:'+id.replace(/[^a-zA-Z0-9_.@:-]/g,'_')+'@homa.local',
    'DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+icsDate(start),
    'DTEND;VALUE=DATE:'+icsDate(end),'SUMMARY:Unavailable','END:VEVENT'
  ].join('\r\n'));
  for(const b of state.bookings.filter(x=>x.roomId===roomId&&x.status!=='Cancelled'))add('booking-'+b.id,b.checkIn,b.checkOut);
  for(const b of (state.blocks||[]).filter(x=>x.roomId===roomId))add('block-'+b.id,b.start,b.end);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HOMA//Room availability export//EN',
    'CALSCALE:GREGORIAN',...rows,'END:VCALENDAR',''].join('\r\n');
}
