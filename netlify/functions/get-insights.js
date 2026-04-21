const ACCOUNT_ID = 'act_779003545080733';
const BASE = 'https://graph.facebook.com/v20.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=3600'
};

const PRESET_MAP = {
  today:     'today',
  yesterday: 'yesterday',
  d7:        'last_7d',
  d30:       'last_30d',
  d90:       'last_90d'
};

async function metaGet(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`);
  const json = await res.json();
  if (json.error) throw new Error(`Meta API: ${json.error.message}`);
  return json;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: 'META_ACCESS_TOKEN not set' }) };

  const q = event.queryStringParameters || {};
  const period = q.period || 'yesterday';
  const preset = PRESET_MAP[period] || 'yesterday';

  try {
    // 1. Campaign insights
    const insightsRes = await metaGet(`/${ACCOUNT_ID}/insights`, {
      access_token: token,
      level: 'campaign',
      date_preset: preset,
      fields: 'campaign_id,campaign_name,spend,clicks,impressions,ctr,cpc,cpm,actions,action_values,frequency,reach',
      limit: 100
    });

    // 2. Campaign statuses
    const campsRes = await metaGet(`/${ACCOUNT_ID}/campaigns`, {
      access_token: token,
      fields: 'id,effective_status',
      limit: 100
    });
    const statusMap = {};
    (campsRes.data || []).forEach(c => { statusMap[c.id] = c.effective_status; });

    // 3. Daily breakdown
    let dailyData = [];
    try {
      const dailyPreset = preset === 'yesterday' ? 'last_7d' : preset;
      const dailyRes = await metaGet(`/${ACCOUNT_ID}/insights`, {
        access_token: token,
        level: 'account',
        date_preset: dailyPreset,
        time_increment: 1,
        fields: 'spend,clicks,actions,action_values,date_start',
        limit: 90
      });
      dailyData = (dailyRes.data || []).map(d => {
        const sp = parseFloat(d.spend || 0);
        const cl = parseInt(d.clicks || 0);
        let purch = 0, rev = 0;
        (d.actions || []).forEach(a => { if (a.action_type === 'purchase') purch = parseInt(a.value); });
        (d.action_values || []).forEach(a => { if (a.action_type === 'purchase') rev = parseFloat(a.value); });
        const dt = new Date(d.date_start);
        return { d: `${dt.getDate()}/${dt.getMonth()+1}`, sp: +sp.toFixed(2), cl, purch, rev: +rev.toFixed(2) };
      });
    } catch (_) {}

    // Build camps
    const camps = (insightsRes.data || [])
      .filter(c => parseFloat(c.spend || 0) > 0)
      .map(c => {
        let msgs = 0, purch = 0, rev = 0;
        (c.actions || []).forEach(a => {
          if (a.action_type === 'onsite_conversion.total_messaging_connection') msgs = parseInt(a.value);
          if (a.action_type === 'purchase') purch = parseInt(a.value);
        });
        (c.action_values || []).forEach(a => { if (a.action_type === 'purchase') rev = parseFloat(a.value); });
        const sp = parseFloat(c.spend || 0);
        return {
          id:   c.campaign_id,
          n:    (c.campaign_name || '').replace(/["""]/g, '"'),
          sp,
          ctr:  parseFloat(c.ctr || 0),
          cpc:  parseFloat(c.cpc || 0),
          cpm:  parseFloat(c.cpm || 0),
          im:   parseInt(c.impressions || 0),
          cl:   parseInt(c.clicks || 0),
          st:   statusMap[c.campaign_id] || 'UNKNOWN',
          msgs, purch,
          rev:  parseFloat(rev),
          freq: parseFloat(c.frequency || 1)
        };
      });

    const totalSp    = camps.reduce((s, c) => s + c.sp,    0);
    const totalPurch = camps.reduce((s, c) => s + c.purch, 0);
    const totalRev   = camps.reduce((s, c) => s + c.rev,   0);
    const totalMsgs  = camps.reduce((s, c) => s + c.msgs,  0);

    const now  = new Date();
    const yest = new Date(now); yest.setDate(yest.getDate() - 1);
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labelMap = {
      today:     `Today — ${now.getDate()} ${M[now.getMonth()]} ${now.getFullYear()}`,
      yesterday: `Yesterday — ${yest.getDate()} ${M[yest.getMonth()]} ${yest.getFullYear()}`,
      d7: 'Last 7 days', d30: 'Last 30 days', d90: 'Last 90 days'
    };
    const iconMap = { today:'🟢', yesterday:'🟡', d7:'📊', d30:'📅', d90:'📆' };
    const note = `${totalSp.toFixed(2)}€ · ${totalPurch} purchases · ${totalRev.toFixed(2)}€ revenue`;

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        success: true, period,
        label:   labelMap[period] || period,
        icon:    iconMap[period]  || '📊',
        note, msgs: totalMsgs, camps, daily: dailyData,
        fetched_at: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message, period }) };
  }
};
