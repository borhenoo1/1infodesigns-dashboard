// ═══════════════════════════════════════════════════════════════
// Netlify Function — InfoDesigns Marketing Dashboard
// Fetches real-time data from Pipeboard API
// Called by the browser → no CORS issues
// ═══════════════════════════════════════════════════════════════

const ACCOUNT_ID = 'act_779003545080733';
const PIPEBOARD_URL = 'https://meta-ads.mcp.pipeboard.co';

exports.handler = async function (event) {
  // CORS headers — allow browser to call this function
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=3600' // Cache 1 hour
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Get requested period from query string (?period=yesterday)
  const period = (event.queryStringParameters || {}).period || 'yesterday';

  // Map period to Pipeboard time_range
  const periodMap = {
    today:     'today',
    yesterday: 'yesterday',
    d7:        'last_7d',
    d30:       'last_30d',
    d90:       'last_90d'
  };
  const timeRange = periodMap[period] || 'yesterday';

  try {
    // Pipeboard API key from Netlify environment variable
    const apiKey = process.env.PIPEBOARD_API_KEY;
    if (!apiKey) {
      throw new Error('PIPEBOARD_API_KEY not set in Netlify environment variables');
    }

    // Fetch campaign-level insights
    const campsRes = await fetch(`${PIPEBOARD_URL}/bulk_get_insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        account_ids: [ACCOUNT_ID],
        level: 'campaign',
        time_range: timeRange,
        use_cache: false
      })
    });

    if (!campsRes.ok) {
      throw new Error(`Pipeboard API error: ${campsRes.status}`);
    }

    const campsData = await campsRes.json();
    const insights = campsData?.results?.[0]?.insights || [];

    // Fetch daily breakdown for charts
    const dailyRes = await fetch(`${PIPEBOARD_URL}/get_insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        object_id: ACCOUNT_ID,
        level: 'account',
        time_breakdown: 'day',
        time_range: timeRange === 'yesterday' ? 'last_7d' : timeRange
      })
    });

    let dailyData = [];
    if (dailyRes.ok) {
      const dailyJson = await dailyRes.json();
      const segs = dailyJson?.segmented_metrics || [];
      dailyData = segs.map(s => {
        const m = s.metrics || {};
        const sp = parseFloat(m.spend || 0);
        const cl = parseInt(m.clicks || 0);
        let purch = 0, rev = 0;
        (m.actions || []).forEach(a => {
          if (a.action_type === 'purchase') purch = parseInt(a.value);
        });
        (m.action_values || []).forEach(av => {
          if (av.action_type === 'purchase') rev = parseFloat(av.value);
        });
        const d = new Date(s.period);
        return {
          d: `${d.getDate()}/${d.getMonth() + 1}`,
          sp: +sp.toFixed(2),
          cl,
          purch,
          rev: +rev.toFixed(2)
        };
      });
    }

    // Parse campaigns
    const camps = insights
      .filter(c => parseFloat(c.spend || 0) > 0)
      .map(c => {
        let msgs = 0, purch = 0, rev = 0;
        (c.actions || []).forEach(a => {
          if (a.action_type === 'onsite_conversion.total_messaging_connection')
            msgs = parseInt(a.value);
          if (a.action_type === 'purchase') purch = parseInt(a.value);
        });
        (c.action_values || []).forEach(av => {
          if (av.action_type === 'purchase') rev = parseFloat(av.value);
        });
        // Use direct fields if available
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
          st:   c.effective_status || 'UNKNOWN',
          msgs,
          purch,
          rev:  parseFloat(rev),
          freq: parseFloat(c.frequency || 1)
        };
      });

    // Totals
    const totalSp    = camps.reduce((s, c) => s + c.sp,    0);
    const totalPurch = camps.reduce((s, c) => s + c.purch, 0);
    const totalRev   = camps.reduce((s, c) => s + c.rev,   0);
    const totalMsgs  = camps.reduce((s, c) => s + c.msgs,  0);

    // Dynamic labels
    const now   = new Date();
    const yest  = new Date(now); yest.setDate(yest.getDate() - 1);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const labelMap = {
      today:     `Today — ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
      yesterday: `Yesterday — ${yest.getDate()} ${months[yest.getMonth()]} ${yest.getFullYear()}`,
      d7:        `Last 7 days`,
      d30:       `Last 30 days`,
      d90:       `Last 90 days`
    };
    const iconMap = { today:'🟢', yesterday:'🟡', d7:'📊', d30:'📅', d90:'📆' };

    const note = `${totalSp.toFixed(2)}€ · ${totalPurch} purchases · ${totalRev.toFixed(2)}€ revenue`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        period,
        label:   labelMap[period] || period,
        icon:    iconMap[period]  || '📊',
        note,
        msgs:    totalMsgs,
        camps,
        daily:   dailyData,
        fetched_at: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('Error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error:   err.message,
        period
      })
    };
  }
};
