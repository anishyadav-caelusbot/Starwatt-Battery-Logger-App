const { InfluxDB } = require('@influxdata/influxdb-client');
const db = new InfluxDB({ url: 'http://69.62.73.206:8086', token: '8971090763' });
const api = db.getQueryApi('starwatt');

// Step 1: find what measurements exist
const q1 = 'from(bucket: "philips") |> range(start: -7d) |> group() |> distinct(column: "_measurement") |> limit(n: 20)';

// Step 2: Get sample rows with tags  
const q2 = 'from(bucket: "philips") |> range(start: -1h) |> limit(n: 5)';

api.collectRows(q1)
  .then(rows => {
    console.log('=== MEASUREMENTS ===');
    rows.forEach(r => console.log(JSON.stringify(r)));
    return api.collectRows(q2);
  })
  .then(rows => {
    console.log('=== SAMPLE ROWS (last 1h) ===');
    rows.forEach(r => console.log(JSON.stringify(r)));
  })
  .catch(err => {
    console.error('ERROR:', err.message);
  });
