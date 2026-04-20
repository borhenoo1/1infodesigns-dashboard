const ACCOUNT_ID = 'act_779003545080733';
const PIPEBOARD_URL = 'https://meta-ads.mcp.pipeboard.co/';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'max-age=3600'
};

async function callTool(apiKey, toolName, args) {
  const res = await fetch(PIPEBOARD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    })
  });
  const rawText = await res.text();
  console.log('STATUS:', res.status);
  console.log('RESPONSE:', rawText.substring(0, 500));
  if (!res.ok) throw new Error(`Pipeboard API error: ${res.status} — ${rawText.substring(0, 200)}`);
  const json = JSON.parse(rawText);
  if (json.error) throw new Error(`Pipeboard error: ${JSON.stringify(json.error)}`);
  const text = json.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : json.result;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const period = (event.queryStringParameters || {}).period || 'yesterday';
  const periodMap = {
    today:     'today',
    yesterday: 'yesterday',
    d7:        'last_7d',
    d30:       'last_30d',
    d90:       'last_90d'
  };
  const timeRange = periodMap[period] || 'yesterday';

  try {
    const apiKey = process.env.PIPEBOARD_API_KEY;
    if (!apiKey) throw new Error('PIPEBOARD_API_KEY not set');

    // Fetch campaign-level insights
    const campsData = await callTool(apiKey, 'get_insights', {
      account_id: ACCOUNT_ID,
      level: 'campaign',
      time_range: timeRange
    });

    const insights = Array.isArray(campsData) ? campsData : (campsData?.insights || campsData?.data || []);

    // Fetch daily breakdown
    let dailyData = [];
    try {
      const dailyRaw = await callTool(apiKey, 'get_insights', {
        account_id: ACCOUNT_ID,
        level: 'account',
        time_breakdown: 'day',
        time_range: timeRange === 'yesterday' ? 'last_7d' : timeRange
      });
      const segs = Array.isArray(dailyRaw) ? dailyRaw : (dailyRaw?.segmented_metrics || dailyRaw?.data || []);
      dailyData = segs.map(s => {
        const m = s.metrics || s || {};
        const sp = parseFloat(m.spend || 0);
        const cl = parseInt(m.clicks || 0);
        let purch = 0, rev = 0;
        (m.actions || []).forEach(a => {
          if (a.action_type === 'purchase') purch = parseInt(a.value);
        });
        (m.action_values || []).forEach(av => {
          if (av.action_type === 'purchase') rev = parseFloat(av.value);
        });
        const d = new Date(s.date_start || s.period || Date.now());
        return {
          d: `${d.getDate()}/${d.getMonth() + 1}`,
          sp: +sp.toFixed(2), cl, purch, rev: +rev.toFixed(2)
        };
      });
    } catch (_) {}

    if (insights.length > 0) console.log('SAMPLE KEYS:', Object.keys(insights[0]).join(', '));

    const camps = insights
      .filter(c => parseFloat(c.spend || 0) > 0)
      .map(c => {
        let msgs = 0, purch = 0, rev = 0;
        (c.actions || []).forEach(a => {
          if (a.action_type === 'onsite_conversion.total_messaging_connection') msgs = parseInt(a.value);
          if (a.action_type === 'purchase') purch = parseInt(a.value);
        });
        (c.action_values || []).forEach(av => {
          if (av.action_type === 'purchase') rev = parseFloat(av.value);
        });
        if (c.purchase_conversions) purch = c.purchase_conversions;
        if (c.purchase_conversion_value) rev = c.purchase_conversion_value;
        return {
          id:   c.campaign_id,
          n:    (c.campaign_name || '').replace(/["""]/g, '"'),
          sp:   parseFloat(c.spend || 0),
          ctr:  parseFloat(c.ctr || 0),
          cpc:  parseFloat(c.cpc || 0),
          cpm:  parseFloat(c.cpm || 0),
          im:   parseInt(c.impressions || 0),
          cl:   parseInt(c.clicks || 0),
          st:   c.effective_status || c.status || c.campaign_status || 'UNKNOWN',
          msgs, purch, rev: parseFloat(rev),
          freq: parseFloat(c.frequency || 1)
        };
      });

    const totalSp    = camps.reduce((s, c) => s + c.sp,    0);
    const totalPurch = camps.reduce((s, c) => s + c.purch, 0);
    const totalRev   = camps.reduce((s, c) => s + c.rev,   0);
    const totalMsgs  = camps.reduce((s, c) => s + c.msgs,  0);

    const now   = new Date();
    const yest  = new Date(now); yest.setDate(yest.getDate() - 1);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labelMap = {
      today:     `Today — ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
      yesterday: `Yesterday — ${yest.getDate()} ${months[yest.getMonth()]} ${yest.getFullYear()}`,
      d7: 'Last 7 days', d30: 'Last 30 days', d90: 'Last 90 days'
    };
    const iconMap = { today:'🟢', yesterday:'🟡', d7:'📊', d30:'📅', d90:'📆' };
    const note = `${totalSp.toFixed(2)}€ · ${totalPurch} purchases · ${totalRev.toFixed(2)}€ revenue`;

    return {
      statusCode: 200,
      headers,
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message, period })
    };
  }
};
