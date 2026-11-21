import {iso,addDays,nights} from './hotel.mjs';
import {iCalImportPreview,writeICal} from './calendar-exchange.mjs';
import {dashboardNumbers,mappingAudit,rateComparison,workQueue,scheduledArrivals} from './decision-engine.mjs';
import {TYPES,CHANNELS_EXTERNAL,fresh,hydrate,availableCount,allTypeRooms,getRule,rateFor,quoteStay,reserve,changeStatus,bulkRule,blockRoom,unblock,updateRoom,channelMap,feedRows,toCSV,importPreview,sampleCSV,availableCandidateIds} from './workspace-core.mjs';

const STORE='homa.workspace.v2';
const OLD='homa.hospitality.demo.v1';
const now=iso(new Date());
let state;
try {
  const raw=localStorage.getItem(STORE) || localStorage.getItem(OLD);
  state=hydrate(raw?JSON.parse(raw):null,now);
}catch(e){state=fresh(now);}
const ui={view:'overview',mobileMenu:false,start:now,days:12,modal:null,channel:'Booking.com',search:'',filter:'All',notice:'',preview:null};
const root=document.getElementById('root');
const money=(n)=>new Intl.NumberFormat('fr-DZ',{maximumFractionDigits:0}).format(Number(n)||0)+' DA';
const fmt=(d)=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
const weekday=(d)=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(text,action,attrs='',cls='button')=>'<button type="button" class="'+cls+'" data-action="'+action+'" '+attrs+'>'+text+'</button>';
const ic=(name,size=18)=>{
  const paths={
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bed:'<path d="M3 19V8m18 11V8M3 16h18M5 13V9h14v4M7 9V6h10v3"/>',
    tag:'<path d="M20 13 12 21 3 12V3h9z"/><circle cx="7.5" cy="7.5" r="1"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18"/>',
    layers:'<path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    left:'<path d="m15 18-6-6 6-6"/>',
    right:'<path d="m9 18 6-6-6-6"/>',
    add:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    export:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    check:'<path d="m5 12 4 4 10-10"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
    hotel:'<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h6M10 22v-4h4v4"/>',
    log:'<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>',
    alert:'<path d="m12 2 10 18H2zM12 9v5M12 17h.01"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    chart:'<path d="M4 19h16M6 16V9m6 7V5m6 11v-6" stroke-linecap="round"/>',
    zap:'<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>'
  };
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
};
const navs=[['overview','grid','Control desk'],['inventory','layers','Inventory & rates'],['calendar','cal','Room calendar'],['reservations','bed','Reservations'],['distribution','globe','Channels'],['performance','chart','Performance'],['operations','log','Operations']];
const room=(id)=>state.rooms.find(r=>r.id===id);
function save(next,message='Saved'){
  state=next;
  try {localStorage.setItem(STORE,JSON.stringify(state));ui.notice=message;}
  catch(e){ui.notice='Browser storage is unavailable. Export a backup before leaving.';}
  render();
}
function alertUser(message){const d=document.querySelector?.('.dialog');if(d){let e=d.querySelector('.form-error');if(!e){e=document.createElement('div');e.className='form-error';e.setAttribute('role','alert');d.querySelector('.dialog-head').after(e);}e.textContent=message;return;}ui.notice=message;render();}
function setView(v){ui.view=v;ui.mobileMenu=false;ui.modal=null;ui.preview=null;ui.notice='';render();}
function download(name,contents,type='text/plain'){
  const file=new Blob([contents],{type});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function head(title,sub,actions=''){
  return '<header class="view-title"><div><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></div><div class="view-actions">'+actions+'</div></header>';
}
const primary=(text,action,extra='')=>button(ic('add',16)+esc(text),action,extra,'button button-primary');
function shell(){
  return '<div class="shell">'+
  '<aside class="sidebar"><div class="mobile-brand-row"><a href="/app" class="brand" data-nav="overview"><span class="brand-mark">H</span><span>homa<span class="brand-period">.</span></span></a>'+
  button(ic('menu',17)+' Menu','toggle-menu','aria-expanded="'+(ui.mobileMenu?'true':'false')+'" aria-label="Open navigation"','mobile-menu-toggle')+'</div>'+
  '<div class="property-switch"><div class="property-initial">MO</div><div class="property-name"><strong>'+esc(state.hotelName)+'</strong><small>'+esc(state.location)+'</small></div></div>'+
  '<span class="side-heading">WORKSPACE</span><nav class="nav-list '+(ui.mobileMenu?'is-open':'')+'">'+navs.map(n=>'<button type="button" class="nav-link '+(ui.view===n[0]?'active':'')+'" data-nav="'+n[0]+'">'+ic(n[1],17)+'<span>'+esc(n[2])+'</span></button>').join('')+'</nav>'+
  '<div class="side-bottom"><div class="local-status"><span class="tiny-square"></span>Local workspace</div><p>Data is stored in this browser. OTA accounts are not connected.</p></div></aside>'+
  '<div class="main"><div class="topbar"><div class="topbar-path">'+ic('hotel',17)+'<span>'+esc(state.hotelName)+'</span><span class="path-separator">/</span><strong>'+esc(navs.find(n=>n[0]===ui.view)?.[2]||'Workspace')+'</strong></div><div class="topbar-right"><span class="today-text">'+fmt(now)+' '+now.slice(0,4)+'</span>'+button(ic('add',16)+' New reservation','new-booking','','button button-primary button-small')+'</div></div>'+
  '<main class="main-inner">'+(ui.notice?'<div class="notice" role="status">'+ic('info',16)+esc(ui.notice)+button(ic('close',14),'clear-notice','aria-label="Dismiss"','plain-icon')+'</div>':'')+renderView()+'</main></div></div>'+renderModal();
}
function dateBar(){
  return '<div class="range-navigation"><div class="range-caption">'+fmt(ui.start)+' – '+fmt(addDays(ui.start,ui.days-1))+'</div>'+
    button(ic('left',16),'date-prev','aria-label="Previous two weeks"','square-button')+
    button('Today','date-today','','button button-subtle')+
    button(ic('right',16),'date-next','aria-label="Next two weeks"','square-button')+'</div>';
}
function renderView(){
  switch(ui.view){
    case 'overview':return overview();
    case 'calendar':return calendar();
    case 'reservations':return reservations();
    case 'distribution':return distribution();
    case 'performance':return performance();
    case 'operations':return operations();
    default:return inventory();
  }
}
function overview(){
  const stats=dashboardNumbers(state,now,14),tasks=workQueue(state,now),arrivals=scheduledArrivals(state,now,7);
  const totalTonight=stats.details[0];
  const metric=(label,value,extra)=>'<div class="metric"><span>'+label+'</span><strong>'+value+'</strong><small>'+extra+'</small></div>';
  const queue=tasks.map(t=>'<button type="button" class="queue-row" data-action="task-go" data-target="'+esc(t.action)+'" data-channel="'+esc(t.channel||'')+'">'+
    '<span class="queue-level '+esc(t.level)+'" aria-hidden="true"></span><span class="queue-copy"><strong>'+esc(t.title)+'</strong><small>'+esc(t.body)+'</small></span><span class="queue-arrow">'+ic('arrow',15)+'</span></button>').join('');
  const guests=arrivals.map(b=>'<button type="button" class="arrival-link" data-action="edit-booking" data-id="'+esc(b.id)+'"><span class="arrival-date"><strong>'+fmt(b.checkIn)+'</strong><small>'+weekday(b.checkIn)+'</small></span><span class="arrival-guest"><strong>'+esc(b.guest)+'</strong><small>'+esc(b.channel)+' · Room '+esc(b.roomId)+' · '+nights(b.checkIn,b.checkOut)+' nights</small></span>'+ic('arrow',15)+'</button>').join('');
  return head('Control desk','Today’s bookings, distribution setup and inventory decisions.',
    button('Edit rates '+ic('arrow',15),'go-inventory','','button button-subtle'))+
  '<div class="desk-headline"><span>'+weekday(now)+', '+fmt(now)+' · '+now.slice(0,4)+'</span><strong>'+esc(state.hotelName)+'</strong><small>Demo data · Browser only · No connected channels</small></div>'+
  '<div class="metrics">'+
    metric('Occupied tonight',totalTonight.occupied+' / '+totalTonight.capacity,totalTonight.available+' rooms available tonight')+
    metric('Forward occupancy',stats.occupancy+'%','Booked room-nights · next 14 nights')+
    metric('Average daily rate',money(stats.adr),'From confirmed/active reservations')+
    metric('Booked room revenue',money(stats.roomRevenue),'For occupied nights in next 14 days')+
  '</div>'+
  '<div class="desk-columns"><section class="surface"><div class="surface-header"><div><h2>Needs attention</h2><p>Tasks calculated from your actual workspace data.</p></div><span class="quiet-count">'+tasks.length+' items</span></div>'+
    '<div class="queue-list">'+(queue||'<div class="empty">No action required right now.</div>')+'</div></section>'+
    '<section class="surface"><div class="surface-header"><div><h2>Upcoming arrivals</h2><p>Confirmed reservations in the next seven days.</p></div>'+button('All reservations '+ic('arrow',15),'go-reservations','','text-action')+'</div>'+
    '<div class="arrival-links">'+(guests||'<div class="empty">No arrivals scheduled.</div>')+'</div></section></div>'+
  '<section class="surface outlook"><div class="surface-header"><div><h2>14-night occupancy outlook</h2><p>Booked nights out of available physical room inventory. No demand forecast is assumed.</p></div>'+button('Open performance '+ic('arrow',15),'go-performance','','text-action')+'</div>'+
    '<div class="outlook-days">'+stats.details.map(d=>'<div class="outlook-day" title="'+d.day+': '+d.occupied+' occupied / '+d.capacity+' sellable"><small>'+weekday(d.day)+'</small><strong>'+fmt(d.day)+'</strong><div class="outlook-bar"><i style="height:'+d.occupancy+'%"></i></div><b>'+d.occupancy+'%</b></div>').join('')+'</div></section>';
}
function inventory(){
  const dates=Array.from({length:ui.days},(_,i)=>addDays(ui.start,i));
  const row=(label,cls,fn,clickable=true)=>'<tr><th scope="row" class="measure">'+label+'</th>'+dates.map(d=>{
    const val=fn(d);
    const ct=clickable?' data-action="edit-rule" data-type="'+cls.split(':')[0]+'" data-date="'+d+'"':'';
    return '<td><button type="button" class="grid-value '+(val.kind||'')+'"'+ct+' '+(!clickable?'disabled':'')+' aria-label="'+esc(label)+' '+d+'">'+val.label+'</button></td>';
  }).join('')+'</tr>';
  const blocks=TYPES.map(type=>{
    const total=allTypeRooms(state,type);
    const lines=[
      row('Available',type+':available',d=>{const c=availableCount(state,type,d),r=getRule(state,type,d);return {label:r.stopSell?'Closed':String(c),kind:r.stopSell?'sell-closed':c===0?'zero':'count'};}),
      row('Nightly rate',type+':rate',d=>({label:money(rateFor(state,type,d)),kind:'rate'})),
      row('Min. stay',type+':stay',d=>({label:getRule(state,type,d).minStay+' night'+(getRule(state,type,d).minStay>1?'s':''),kind:'restr'})),
      row('Restrictions',type+':restr',d=>{const r=getRule(state,type,d);return {label:[r.cta?'No arrival':'',r.ctd?'No departure':'',r.stopSell?'Stop sell':''].filter(Boolean).join(', ')||'Open',kind:r.cta||r.ctd||r.stopSell?'restriction':'open'};})
    ].join('');
    return '<tbody class="type-block"><tr class="type-heading"><th colspan="'+(ui.days+1)+'"><span>'+esc(type)+'</span><small>'+total+' bookable room'+(total!==1?'s':'')+'</small></th></tr>'+lines+'</tbody>';
  }).join('');
  return head('Availability & rates','Edit daily prices, remaining rooms and stay restrictions from one place.',primary('Bulk update','bulk-rule'))+
    '<section class="surface matrix-surface"><div class="matrix-toolbar"><div><h2>Inventory matrix</h2><p>Click any date cell to edit its room type and restrictions.</p></div>'+dateBar()+'</div>'+
    '<div class="matrix-scroll"><table class="inventory-table"><thead><tr><th class="matrix-first">Room type / metric</th>'+dates.map(d=>'<th class="'+(d===now?'is-today':'')+'"><small>'+weekday(d)+'</small><span>'+fmt(d)+'</span></th>').join('')+'</tr></thead>'+blocks+'</table></div>'+
    '<div class="matrix-footer"><span>Availability = bookable rooms minus existing stays and maintenance blocks.</span><span>Changes are local until a distribution integration is connected.</span></div></section>';
}
function calendar(){
  const dates=Array.from({length:ui.days},(_,i)=>addDays(ui.start,i));
  const rows=state.rooms.map(r=>{
    let previous='';
    const cells=dates.map(d=>{
      const b=state.bookings.find(x=>x.roomId===r.id&&x.status!=='Cancelled'&&x.checkIn<=d&&d<x.checkOut);
      const blocked=state.blocks.find(x=>x.roomId===r.id&&x.start<=d&&d<x.end);
      let inner='';
      if(b){inner='<button class="calendar-cell occupied" data-action="edit-booking" data-id="'+esc(b.id)+'" title="'+esc(b.guest)+' · '+esc(b.id)+'">'+(b.id===previous?'':esc(b.guest.split(' ')[0]))+'</button>';previous=b.id;}
      else if(blocked){inner='<button class="calendar-cell blocked" data-action="unblock" data-id="'+esc(blocked.id)+'" title="'+esc(blocked.reason)+'">Blocked</button>';previous='';}
      else if(r.status==='Maintenance'){inner='<div class="calendar-cell maintenance">Out of service</div>';previous='';}
      else{inner='<button class="calendar-cell empty-cell" data-action="book-day" data-id="'+esc(r.id)+'" data-date="'+d+'" aria-label="Book room '+esc(r.id)+' on '+d+'">+</button>';previous='';}
      return '<td>'+inner+'</td>';
    }).join('');
    return '<tr><th><strong>'+esc(r.id)+'</strong><small>'+esc(r.name)+'</small></th>'+cells+'</tr>';
  }).join('');
  return head('Room calendar','See every stay by room, with maintenance blocks in the same view.',primary('Block room','new-block'))+
    '<section class="surface matrix-surface"><div class="matrix-toolbar"><div><h2>Room allocation</h2><p>Select an empty night to reserve it or an occupied night to edit the stay.</p></div>'+dateBar()+'</div>'+
    '<div class="matrix-scroll"><table class="calendar-table"><thead><tr><th>Room</th>'+dates.map(d=>'<th><small>'+weekday(d)+'</small><span>'+fmt(d)+'</span></th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="calendar-legend"><span><i class="legend-occupied"></i> Reservation</span><span><i class="legend-block"></i> Maintenance block</span><span><i class="legend-free"></i> Available</span></div></section>';
}
function reservations(){
  const list=[...state.bookings].filter(b=>ui.filter==='All'||ui.filter===b.status)
    .sort((a,b)=>a.checkIn.localeCompare(b.checkIn));
  const options=['All','Confirmed','Checked in','Checked out','Cancelled'].map(v=>'<option '+(v===ui.filter?'selected':'')+'>'+v+'</option>').join('');
  const rows=list.map(b=>{
    const roomName=room(b.roomId)?.name||'';
    const next=b.status==='Confirmed'?button('Check in','check-in','data-id="'+esc(b.id)+'"','text-action'):b.status==='Checked in'?button('Check out','check-out','data-id="'+esc(b.id)+'"','text-action'):'';
    return '<tr data-reservation-row="true" data-search="'+esc([b.guest,b.id,b.email,b.channel,b.roomId,b.externalRef].join(' ').toLowerCase())+'"><td><div class="cell-main">'+esc(b.guest)+'</div><small>'+esc(b.id)+(b.externalRef?' · '+esc(b.externalRef):'')+'</small></td><td>'+esc(b.roomId)+'<small>'+esc(roomName)+'</small></td>'+
    '<td>'+fmt(b.checkIn)+'<small>'+nights(b.checkIn,b.checkOut)+' nights</small></td><td>'+fmt(b.checkOut)+'</td><td>'+esc(b.channel)+'</td><td><span class="status-text">'+esc(b.status)+'</span></td>'+
    '<td class="right">'+next+button('Edit','edit-booking','data-id="'+esc(b.id)+'"','text-action')+'</td></tr>';
  }).join('');
  return head('Reservations','Search, create, modify and complete guest stays.',primary('New reservation','new-booking')+button(ic('export',16)+' Import CSV','import-csv','','button button-subtle'))+
  '<section class="surface"><div class="table-toolbar"><div><h2>Booking register <span class="muted-count">'+list.length+'</span></h2></div><div class="table-controls"><label class="search-field">'+ic('search',16)+'<input id="booking-search" type="search" placeholder="Search guest, reference or room" value="'+esc(ui.search)+'" /></label><label class="sr-only" for="status-filter">Filter status</label><select id="status-filter">'+options+'</select></div></div>'+
  '<div class="table-scroll"><table class="register"><thead><tr><th>Guest / reference</th><th>Room</th><th>Arrival</th><th>Departure</th><th>Source</th><th>Status</th><th class="right">Actions</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="7" class="empty">No reservations match these filters.</td></tr>')+'<tr data-search-empty="true" hidden><td colspan="7" class="empty">No reservations match your search.</td></tr></tbody></table></div></section>';
}
function distribution(){
  const audit=mappingAudit(state),comparison=rateComparison(state,ui.start);
  const cards=audit.byChannel.map(c=>'<button type="button" class="channel-health '+(ui.channel===c.channel?'selected':'')+'" data-action="select-channel" data-channel="'+esc(c.channel)+'">'+
    '<span><strong>'+esc(c.channel)+'</strong><small>Offline · Mapping only</small></span>'+
    '<span class="channel-numbers"><strong>'+c.configured+' / '+c.required+'</strong><small>room types mapped</small></span></button>').join('');
  const rows=TYPES.map(type=>{
    const config=state.mappings[ui.channel+'|'+type]||{remoteId:'',adjustment:0};
    return '<tr><td><strong>'+type+'</strong><small>'+allTypeRooms(state,type)+' rooms in inventory</small></td><td>'+ (config.remoteId?'<span class="mapping-id">'+esc(config.remoteId)+'</span>':'<span class="unmapped">Needs mapping</span>')+'</td><td>'+(Number(config.adjustment)>=0?'+':'')+config.adjustment+'%</td><td>'+money(Math.round(rateFor(state,type,ui.start)*(1+Number(config.adjustment)/100)))+'</td><td class="right">'+button('Configure','map-channel','data-type="'+type+'"','text-action')+'</td></tr>';
  }).join('');
  const comparisonRows=comparison.map(c=>'<tr><td><strong>'+esc(c.type)+'</strong><small>'+c.available+' rooms available</small></td><td>'+money(c.base)+'</td>'+
    c.channels.map(p=>'<td>'+money(p.rate)+'<small>'+(p.mapped?'Configured markup: '+(p.adjustment>=0?'+':'')+p.adjustment+'%':'Not mapped · Preview')+'</small></td>').join('')+'</tr>').join('');
  return head('Channel distribution','Configure and audit what would be sent to booking channels. No real connection is active.',
    button(ic('export',16)+' Export ARI CSV','export-ari','','button button-primary'))+
  '<div class="connection-state"><span class="connection-indicator"></span><div><strong>No channels connected</strong><p>All three OTA connections require partner-approved access, credentials and a server integration. Local mapping and exports cannot publish inventory.</p></div></div>'+
  '<div class="health-grid">'+cards+'</div>'+
  '<section class="surface"><div class="table-toolbar"><div><h2>Room & rate-plan mapping</h2><p>Map every internal room category to the identifiers supplied by each channel.</p></div><select id="channel-select" aria-label="Select channel">'+CHANNELS_EXTERNAL.map(c=>'<option '+(c===ui.channel?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+
  '<div class="table-scroll"><table class="register"><thead><tr><th>Internal room type</th><th>Channel plan ID</th><th>Rate adjustment</th><th>Proposed nightly rate</th><th class="right">Action</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>'+
  '<section class="surface feed-surface"><div class="surface-header"><div><h2>Rate comparison · '+fmt(ui.start)+'</h2><p>Expected prices based on your configured markups. Not actual OTA listing prices.</p></div>'+dateBar()+'</div>'+
  '<div class="table-scroll"><table class="register comparison-table"><thead><tr><th>Room type</th><th>Base rate</th>'+CHANNELS_EXTERNAL.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+comparisonRows+'</tbody></table></div></section>'+
  '<section class="surface calendar-exchange"><div><h2>Manual calendar exchange</h2><p>Import or export room availability using .ics files. Exchange is not subscribed or synchronized automatically.</p></div><div class="exchange-actions">'+
  button('Import .ics','import-ical','','button button-subtle')+
  button(ic('export',16)+' Export room .ics','export-ical','','button button-subtle')+'</div></section>';
}
function performance(){
  const stats=dashboardNumbers(state,ui.start,14);
  const metric=(label,value,extra)=>'<div class="metric"><span>'+label+'</span><strong>'+value+'</strong><small>'+extra+'</small></div>';
  const daily=stats.details.map(d=>'<tr><td><strong>'+weekday(d.day)+', '+fmt(d.day)+'</strong></td><td>'+d.capacity+'</td><td>'+d.occupied+'</td><td>'+d.available+'</td>'+
    '<td><div class="cell-gauge"><i style="width:'+d.occupancy+'%"></i></div>'+d.occupancy+'%</td><td class="right">'+money(d.revenue)+'</td></tr>').join('');
  const mix=stats.channelMix.map(c=>'<tr><td><strong>'+esc(c.channel)+'</strong></td><td>'+c.bookings+'</td><td>'+c.roomNights+'</td><td class="right">'+money(c.revenue)+'</td></tr>').join('');
  const types=stats.roomMix.map(c=>'<tr><td><strong>'+esc(c.type)+'</strong></td><td>'+c.rooms+'</td><td>'+c.roomNights+'</td><td class="right">'+money(c.revenue)+'</td></tr>').join('');
  return head('Performance','Booked revenue and occupancy calculated from the current reservation ledger.',
    button(ic('export',16)+' Export report','export-report','','button button-primary'))+
  '<div class="performance-toolbar"><div><strong>Reporting window</strong><p>14 nights starting '+fmt(ui.start)+', '+ui.start.slice(0,4)+'</p></div>'+dateBar()+'</div>'+
  '<div class="metrics">'+
    metric('Occupancy',stats.occupancy+'%',stats.occupiedRoomNights+' of '+stats.inventoryRoomNights+' room-nights occupied')+
    metric('ADR',money(stats.adr),'Booked room revenue / booked room-nights')+
    metric('RevPAR',money(stats.revpar),'Booked revenue / sellable room-nights')+
    metric('Booked room revenue',money(stats.roomRevenue),'Future/past room-nights in selected window')+
  '</div>'+
  '<div class="reports-layout"><section class="surface"><div class="surface-header"><div><h2>Daily availability & revenue</h2><p>Calculated from reservations and room blocks.</p></div></div>'+
    '<div class="table-scroll"><table class="register compact"><thead><tr><th>Night</th><th>Sellable</th><th>Booked</th><th>Available</th><th>Occupancy</th><th class="right">Booked revenue</th></tr></thead><tbody>'+daily+'</tbody></table></div></section>'+
    '<div class="reports-aside"><section class="surface"><div class="surface-header"><div><h2>Revenue by source</h2><p>Allocated by occupied room-night, not payment collected.</p></div></div>'+
      '<div class="table-scroll"><table class="register compact"><thead><tr><th>Source</th><th>Bookings</th><th>Nights</th><th class="right">Revenue</th></tr></thead><tbody>'+(mix||'<tr><td colspan="4" class="empty">No bookings in this period.</td></tr>')+'</tbody></table></div></section>'+
    '<section class="surface"><div class="surface-header"><div><h2>Revenue by room type</h2><p>Booked value based on rates stored with stays.</p></div></div>'+
      '<div class="table-scroll"><table class="register compact"><thead><tr><th>Type</th><th>Rooms</th><th>Nights</th><th class="right">Revenue</th></tr></thead><tbody>'+types+'</tbody></table></div></section></div></div>'+
  '<p class="report-footnote">Methodology: rates are per reservation per night; cancellations are excluded, and maintenance blocks reduce sellable room-night capacity. No tax, fee, payment, demand or market-rate data is inferred.</p>';
}
function operations(){
  const blocks=[...state.blocks].sort((a,b)=>a.start.localeCompare(b.start));
  const rows=blocks.map(b=>'<tr><td>Room '+esc(b.roomId)+'</td><td>'+fmt(b.start)+'</td><td>'+fmt(b.end)+'</td><td>'+esc(b.reason)+'</td><td class="right">'+button('Remove','unblock','data-id="'+esc(b.id)+'"','text-action')+'</td></tr>').join('');
  const roomRows=state.rooms.map(r=>'<tr><td><strong>'+esc(r.id)+'</strong><small>'+esc(r.floor||'')+'</small></td><td>'+esc(r.name)+'</td><td>'+esc(r.type)+'</td>'+
    '<td>'+money(r.rate)+'</td><td><span class="'+(r.status==='Maintenance'?'room-offline':'room-online')+'">'+esc(r.status)+'</span></td>'+
    '<td class="right">'+button('Edit room','edit-room','data-id="'+esc(r.id)+'"','text-action')+'</td></tr>').join('');
  const activity=state.activity.slice(0,20).map(a=>'<div class="activity-item"><div class="activity-mark"></div><div><strong>'+esc(a.message)+'</strong><small>'+new Date(a.at).toLocaleString('en-GB')+'</small></div></div>').join('');
  return head('Operations','Manage physical rooms, maintenance and local change history.',primary('Block a room','new-block'))+
  '<section class="surface"><div class="surface-header"><div><h2>Physical room directory</h2><p>Edit room names, base rates and maintenance availability.</p></div></div>'+
    '<div class="table-scroll"><table class="register"><thead><tr><th>Room</th><th>Name</th><th>Room category</th><th>Base rate</th><th>State</th><th class="right">Action</th></tr></thead><tbody>'+roomRows+'</tbody></table></div></section>'+
  '<div class="split operations-split"><section class="surface"><div class="surface-header"><div><h2>Temporary room holds</h2><p>Maintenance dates reduce the inventory available for sale.</p></div></div><div class="table-scroll"><table class="register"><thead><tr><th>Room</th><th>From</th><th>Until</th><th>Reason</th><th></th></tr></thead><tbody>'+
    (rows||'<tr><td class="empty" colspan="5">No scheduled room blocks.</td></tr>')+'</tbody></table></div></section>'+
  '<section class="surface"><div class="surface-header"><div><h2>Change history</h2><p>Recorded actions in this browser, not a server audit log.</p></div></div><div class="activity-list">'+
    (activity||'<p class="empty">No recorded changes yet.</p>')+'</div></section></div>'+
  '<section class="surface data-tools"><div><h2>Workspace data</h2><p>Export a local backup, restore one, or download the reservation register.</p></div><div class="tool-buttons">'+
    button(ic('export',16)+' Back up','export-backup','','button button-subtle')+
    button(ic('export',16)+' Reservations CSV','export-reservations','','button button-subtle')+
    button('Restore backup','restore-backup','','button button-subtle')+
    '<input type="file" id="backup-file" accept=".json,application/json" hidden></div></section>';
}
function selectOptions(list,selected){return list.map(item=>'<option value="'+esc(item.value||item)+'" '+((item.value||item)===selected?'selected':'')+'>'+esc(item.label||item)+'</option>').join('');}
function field(label,name,value='',type='text',extra=''){const optional=['email','externalRef','rate','remoteId'].includes(name);return '<label class="field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+(optional?'':' required')+'></label>';}
function selectField(label,name,values,chosen){return '<label class="field"><span>'+label+'</span><select name="'+name+'">'+selectOptions(values,chosen)+'</select></label>';}
function modalShell(title,intro,body){
  return '<div class="modal-backdrop" data-action="close-modal"><section class="dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="dialog-head"><div><h2>'+esc(title)+'</h2><p>'+esc(intro)+'</p></div>'+button(ic('close',20),'close-modal','aria-label="Close"','plain-icon')+'</div>'+body+'</section></div>';
}
function modalActions(saveText='Save changes',withCancel=true){
  return '<div class="dialog-actions">'+(withCancel?button('Cancel','close-modal','','button button-subtle'):'')+'<button type="submit" class="button button-primary">'+esc(saveText)+'</button></div>';
}
function bookingDialog(){
  const existing=state.bookings.find(b=>b.id===ui.modal.id);
  const b=existing||{guest:'',email:'',roomId:ui.modal.roomId||state.rooms.find(r=>r.status!=='Maintenance')?.id,
    checkIn:ui.modal.date||now,checkOut:addDays(ui.modal.date||now,1),guests:2,channel:'Direct',status:'Confirmed',externalRef:''};
  return modalShell(existing?'Edit reservation':'New reservation','Changes affect inventory immediately in this browser.',
  '<form data-form="booking" class="dialog-form">'+
  '<div class="form-grid">'+field('Guest name','guest',b.guest)+field('Email address','email',b.email,'email','placeholder="name@example.com"')+
  field('Check-in','checkIn',b.checkIn,'date')+field('Check-out','checkOut',b.checkOut,'date')+
  selectField('Room','roomId',state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name+(r.status==='Maintenance'?' (maintenance)':'')})),b.roomId)+
  field('Guests','guests',b.guests,'number','min="1" max="8" step="1"')+
  selectField('Source','channel',['Direct','Booking.com','Airbnb','Expedia','Walk-in'],b.channel)+
  field('External reference (optional)','externalRef',b.externalRef||'','text','placeholder="OTA booking ID"')+'</div>'+
  (existing?'<div class="edit-summary">Current status: <strong>'+esc(existing.status)+'</strong>'+ (existing.status!=='Cancelled'&&existing.status!=='Checked out'?button('Cancel reservation','cancel-booking','data-id="'+esc(existing.id)+'"','text-danger'):'')+'</div>':'')+
  modalActions(existing?'Update reservation':'Create reservation')+'</form>');
}
function ruleDialog(){
  const m=ui.modal;
  const r=getRule(state,m.type,m.from);
  const val=r.rate==null?'':r.rate;
  return modalShell('Edit availability & rates',m.type+' · Save a single date or apply a date range.',
  '<form class="dialog-form" data-form="rule"><div class="form-grid">'+
  selectField('Room type','type',TYPES,m.type)+field('From','from',m.from,'date')+
  field('To (inclusive)','to',m.to,'date')+field('Nightly rate (DZD)','rate',val,'number','min="0" step="1" placeholder="Use base rate"')+
  field('Minimum stay (nights)','minStay',r.minStay,'number','min="1" max="90"')+'</div>'+
  '<div class="checks"><label><input type="checkbox" name="stopSell" '+(r.stopSell?'checked':'')+'> Stop sell (close room type for sale)</label>'+
  '<label><input type="checkbox" name="cta" '+(r.cta?'checked':'')+'> Closed to arrival</label>'+
  '<label><input type="checkbox" name="ctd" '+(r.ctd?'checked':'')+'> Closed to departure</label></div>'+
  '<p class="form-help">These controls apply to the selected room type and dates. Existing reservations are not cancelled.</p>'+modalActions('Apply changes')+'</form>');
}
function mappingDialog(){
  const m=ui.modal;const old=state.mappings[ui.channel+'|'+m.type]||{remoteId:'',adjustment:0};
  return modalShell('Edit channel mapping',ui.channel+' · '+m.type,
  '<form class="dialog-form" data-form="mapping">'+
  field('External room or rate-plan ID','remoteId',old.remoteId,'text','placeholder="ID from channel extranet"')+
  field('Rate adjustment (%)','adjustment',old.adjustment,'number','min="-99" max="500" step="0.5"')+
  '<p class="form-help">Saving a mapping does not connect an account. Use the identifier provided by your channel and verify it before any future API integration.</p>'+
  modalActions('Save mapping')+'</form>');
}
function roomDialog(){
  const r=state.rooms.find(x=>x.id===ui.modal.id);
  if(!r)return '';
  return modalShell('Edit room '+r.id,'Changes to base pricing or maintenance affect future sellable inventory.',
    '<form class="dialog-form" data-form="room"><div class="form-grid">'+
      field('Room name','name',r.name)+field('Base nightly rate (DZD)','rate',r.rate,'number','min="0" max="100000000" step="1"')+
      selectField('Room status','status',['Ready','Maintenance'],r.status)+'</div>'+
    '<p class="form-help">New reservations for this room use its base rate unless a daily room-type override applies. Existing reservation rates stay unchanged. A room with upcoming bookings cannot be taken out of service until they are moved or cancelled.</p>'+
    modalActions('Save room')+'</form>');
}
function blockDialog(){
  return modalShell('Block a room','Use temporary blocks for maintenance and rooms taken out of service.',
  '<form class="dialog-form" data-form="block"><div class="form-grid">'+
  selectField('Room','roomId',state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name})),state.rooms[0].id)+
  field('Reason','reason','Maintenance')+field('From','start',now,'date')+field('Until (exclusive)','end',addDays(now,1),'date')+'</div>'+
  '<p class="form-help">You cannot block nights that already have confirmed reservations.</p>'+modalActions('Block room')+'</form>');
}
function importDialog(){
  const preview=ui.preview;
  const sample=sampleCSV();
  const summary=preview?'<div class="import-summary"><strong>'+preview.accepted.length+' accepted</strong><span>'+preview.rejected.length+' rejected</span></div>'+
     (preview.rejected.length?'<div class="validation-errors">'+preview.rejected.map(v=>'<div>Row '+v.line+': '+esc(v.guest)+' — '+esc(v.error)+'</div>').join('')+'</div>':'')+
     (preview.accepted.length?button('Commit '+preview.accepted.length+' reservations','commit-import','','button button-primary'):''):'';
  return modalShell('Import reservations from CSV','Checks duplicates, restrictions and room availability before saving.',
    '<div class="dialog-form"><p class="form-help">Required columns: channel, externalRef, guest, checkIn, checkOut, roomType, email, guests. Dates use YYYY-MM-DD.</p>'+
    '<label class="field"><span>CSV content</span><textarea id="csv-import" rows="9" spellcheck="false" placeholder="'+esc(sample)+'">'+esc(ui.modal.csv||'')+'</textarea></label>'+
    '<div class="dialog-actions">'+button('Cancel','close-modal','','button button-subtle')+button('Validate rows','preview-import','','button button-primary')+'</div>'+summary+'</div>');
}
function icalImportDialog(){
  const m=ui.modal,p=ui.preview;
  const rows=p?'<div class="import-summary"><strong>'+p.accepted.length+' accepted</strong><span>'+p.rejected.length+' rejected</span></div>'+
    (p.rejected.length?'<div class="validation-errors">'+p.rejected.map(v=>'<div>Event '+v.line+': '+esc(v.error)+'</div>').join('')+'</div>':'')+
    (p.accepted.length?button('Commit '+p.accepted.length+' calendar entries','commit-ical','','button button-primary'):''):'';
  return modalShell('Import iCalendar','Import room holds from an existing calendar export. Dates are checked before saving.',
    '<div class="dialog-form"><div class="form-grid">'+
    '<label class="field"><span>Room</span><select id="ical-room">'+selectOptions(state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name})),m.roomId||state.rooms[0].id)+'</select></label>'+
    '<label class="field"><span>Source</span><select id="ical-channel">'+selectOptions(CHANNELS_EXTERNAL,m.channel||'Airbnb')+'</select></label></div>'+
    '<p class="form-help">Only all-day events are supported. Imported events block room availability; they do not create paid guest reservations or add revenue.</p>'+
    '<label class="field file-field"><span>Choose .ics file</span><input type="file" id="ical-file" accept=".ics,text/calendar"></label>'+
    '<label class="field"><span>Or paste calendar content</span><textarea id="ical-text" rows="7" spellcheck="false" placeholder="BEGIN:VCALENDAR">'+esc(m.text||'')+'</textarea></label>'+
    '<div class="dialog-actions">'+button('Cancel','close-modal','','button button-subtle')+button('Check availability','preview-ical','','button button-primary')+'</div>'+rows+'</div>');
}
function icalExportDialog(){
  return modalShell('Export room calendar','Download a file containing occupied dates only; guest identities are excluded.',
    '<div class="dialog-form"><label class="field"><span>Room</span><select id="ical-export-room">'+selectOptions(state.rooms.map(r=>({value:r.id,label:r.id+' — '+r.name})),state.rooms[0].id)+'</select></label>'+
    '<p class="form-help">Exporting an .ics file does not automatically update any booking website. Upload it manually where calendar imports are supported.</p>'+
    '<div class="dialog-actions">'+button('Cancel','close-modal','','button button-subtle')+
    button(ic('export',16)+' Download .ics','download-ical','','button button-primary')+'</div></div>');
}
function renderModal(){
  if(!ui.modal)return '';
  switch(ui.modal.kind){
    case 'booking':return bookingDialog();
    case 'rule':return ruleDialog();
    case 'mapping':return mappingDialog();
    case 'block':return blockDialog();
    case 'room':return roomDialog();
    case 'csv':return importDialog();
    case 'icalImport':return icalImportDialog();
    case 'icalExport':return icalExportDialog();
    default:return '';
  }
}

function filterReservationRows(){
  if(ui.view!=='reservations'||typeof root.querySelectorAll!=='function')return;
  const q=ui.search.trim().toLowerCase();
  const rows=root.querySelectorAll('tr[data-reservation-row]');
  let shown=0;
  for(const row of rows){
    const match=!q||row.dataset.search.includes(q);
    row.hidden=!match;
    if(match)shown++;
  }
  const counter=root.querySelector('.muted-count');
  if(counter)counter.textContent=String(shown);
  const empty=root.querySelector('[data-search-empty]');
  if(empty)empty.hidden=shown>0;
}
function render(){
  document.title='HOMA — '+(navs.find(n=>n[0]===ui.view)?.[2]||'Hotel operations');
  root.innerHTML=shell();
  document.body.classList.toggle('dialog-open',Boolean(ui.modal));
  filterReservationRows();
}
function action(name,el) {
  const id=el.dataset.id;
  try{
    switch(name){
      case 'close-modal':ui.modal=null;ui.preview=null;render();break;
      case 'clear-notice':ui.notice='';render();break;
      case 'toggle-menu':ui.mobileMenu=!ui.mobileMenu;render();break;
      case 'go-inventory':case 'go-reservations':case 'go-distribution':case 'go-performance':setView(name.slice(3));break;
      case 'task-go':{if(el.dataset.channel)ui.channel=el.dataset.channel;setView(el.dataset.target);break;}
      case 'select-channel':ui.channel=el.dataset.channel;render();break;
      case 'date-prev':ui.start=addDays(ui.start,-ui.days);render();break;
      case 'date-next':ui.start=addDays(ui.start,ui.days);render();break;
      case 'date-today':ui.start=now;render();break;
      case 'new-booking':ui.modal={kind:'booking'};render();break;
      case 'book-day':ui.modal={kind:'booking',roomId:id,date:el.dataset.date};render();break;
      case 'edit-booking':ui.modal={kind:'booking',id};render();break;
      case 'edit-rule':ui.modal={kind:'rule',type:el.dataset.type,from:el.dataset.date,to:el.dataset.date};render();break;
      case 'bulk-rule':ui.modal={kind:'rule',type:'Classic',from:ui.start,to:addDays(ui.start,ui.days-1)};render();break;
      case 'map-channel':ui.modal={kind:'mapping',type:el.dataset.type};render();break;
      case 'new-block':ui.modal={kind:'block'};render();break;
      case 'edit-room':ui.modal={kind:'room',id};render();break;
      case 'unblock':if(confirm('Remove this maintenance block?'))save(unblock(state,id),'Maintenance block removed.');break;
      case 'check-in':save(changeStatus(state,id,'Checked in'),'Guest checked in.');break;
      case 'check-out':save(changeStatus(state,id,'Checked out'),'Guest checked out.');break;
      case 'cancel-booking':if(confirm('Cancel reservation '+id+'?')){save(changeStatus(state,id,'Cancelled'),'Reservation cancelled.');ui.modal=null;render();}break;
      case 'import-csv':ui.modal={kind:'csv',csv:''};ui.preview=null;render();break;
      case 'import-ical':ui.modal={kind:'icalImport',text:'',channel:'Airbnb',roomId:state.rooms[0].id};ui.preview=null;render();break;
      case 'export-ical':ui.modal={kind:'icalExport'};render();break;
      case 'preview-ical':{
        const text=document.getElementById('ical-text').value;
        const channel=document.getElementById('ical-channel').value;
        const roomId=document.getElementById('ical-room').value;
        ui.modal.text=text;ui.modal.channel=channel;ui.modal.roomId=roomId;
        ui.preview=iCalImportPreview(state,text,roomId,channel);render();break;
      }
      case 'commit-ical':{
        if(!ui.preview||!ui.preview.accepted.length)throw Error('No valid calendar entries to import.');
        const next=ui.preview.staged,c=ui.preview.accepted.length;
        ui.modal=null;ui.preview=null;save(next,c+' calendar entries imported.');break;
      }
      case 'download-ical':{
        const roomId=document.getElementById('ical-export-room').value;
        download('homa-room-'+roomId+'.ics',writeICal(state,roomId),'text/calendar;charset=utf-8');
        ui.modal=null;alertUser('Calendar file exported for room '+roomId+'.');break;
      }
      case 'preview-import':{
        const csv=document.getElementById('csv-import').value;ui.modal.csv=csv;
        ui.preview=importPreview(state,csv);render();break;
      }
      case 'commit-import':{
        if(!ui.preview||!ui.preview.accepted.length)throw Error('No valid reservations to import.');
        const updated=ui.preview.staged;const c=ui.preview.accepted.length;
        ui.modal=null;ui.preview=null;save(updated,c+' reservations imported.');break;
      }
      case 'export-report':download('homa-performance-'+ui.start+'.csv',toCSV(dashboardNumbers(state,ui.start,14).details),'text/csv;charset=utf-8');alertUser('Performance report exported from current booking data.');break;
      case 'export-ari':download('homa-'+ui.channel.toLowerCase().replace(/\W+/g,'-')+'-ari.csv',toCSV(feedRows(state,ui.channel,ui.start,14)),'text/csv;charset=utf-8');alertUser('Offline ARI CSV exported. No OTA has been updated.');break;
      case 'export-backup':download('homa-backup-'+now+'.json',JSON.stringify(state,null,2),'application/json');alertUser('Workspace backup exported.');break;
      case 'export-reservations':download('homa-reservations-'+now+'.csv',toCSV(state.bookings.map(b=>({id:b.id,guest:b.guest,room:b.roomId,checkIn:b.checkIn,checkOut:b.checkOut,channel:b.channel,status:b.status,externalRef:b.externalRef||'',guests:b.guests,rate:b.rate}))), 'text/csv');break;
      case 'restore-backup':document.getElementById('backup-file').click();break;
    }
  }catch(err){alertUser(err.message||'Something went wrong.');}
}
root.addEventListener('click',e=>{
  const tab=e.target.closest('[data-nav]');
  if(tab){e.preventDefault();setView(tab.dataset.nav);return;}
  const trigger=e.target.closest('[data-action]');
  if(!trigger)return;
  if(trigger.classList.contains('modal-backdrop')&&e.target!==trigger)return;
  if(e.target.closest('.dialog') && trigger.dataset.action==='close-modal' && trigger.classList.contains('modal-backdrop'))return;
  e.preventDefault();action(trigger.dataset.action,trigger);
});
root.addEventListener('change',async e=>{
  if(e.target.id==='status-filter'){ui.filter=e.target.value;render();}
  if(e.target.id==='channel-select'){ui.channel=e.target.value;render();}

  if(e.target.id==='ical-file'){
    try{const f=e.target.files?.[0];if(!f)return;
      if(f.size>2000000)throw Error('Calendar file exceeds 2 MB.');
      const text=await f.text();if(ui.modal?.kind!=='icalImport')return;
      ui.modal.text=text;ui.preview=null;render();
    }catch(err){alertUser(err.message||'Could not read calendar.');}
  }
  if(e.target.id==='backup-file'){
    try {const f=e.target.files?.[0];if(!f)return; if(f.size>10*1024*1024)throw Error('Backup exceeds 10 MB.');
      const imported=hydrate(JSON.parse(await f.text()));if(confirm('Replace current local data with this backup?'))save(imported,'Workspace restored.');
    }catch(err){alertUser(err.message||'Could not restore backup.');}
  }
});
root.addEventListener('input',e=>{
  if(e.target.id!=='booking-search')return;
  ui.search=e.target.value;
  filterReservationRows();
});
root.addEventListener('submit',e=>{
  const form=e.target.closest('[data-form]');if(!form)return;
  e.preventDefault();
  const data=new FormData(form),v=Object.fromEntries(data.entries());
  try {
    if(form.dataset.form==='booking'){
      const id=ui.modal.id;const original=state.bookings.find(b=>b.id===id);
      const item={...original,...v,guests:Number(v.guests),status:original?.status||'Confirmed',externalRef:String(v.externalRef||'').trim(),rate:original?.rate??undefined};
      if(!item.externalRef)delete item.externalRef;
      const result=reserve(state,item,id||null);
      ui.modal=null;save(result,id?'Reservation updated.':'Reservation created.');return;
    }
    if(form.dataset.form==='rule'){
      const item={...v,stopSell:data.has('stopSell'),cta:data.has('cta'),ctd:data.has('ctd')};
      ui.modal=null;save(bulkRule(state,item),'Rate and restrictions updated.');return;
    }
    if(form.dataset.form==='mapping'){
      const result=channelMap(state,ui.channel,ui.modal.type,v.remoteId,v.adjustment);
      ui.modal=null;save(result,'Mapping saved locally.');return;
    }
    if(form.dataset.form==='room'){
      const result=updateRoom(state,{...v,roomId:ui.modal.id});ui.modal=null;save(result,'Room settings saved.');return;
    }
    if(form.dataset.form==='block'){
      const result=blockRoom(state,v);ui.modal=null;save(result,'Room blocked.');return;
    }
  }catch(err){alertUser(err.message||'Could not save.');}
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.modal){ui.modal=null;render();}});
render();
