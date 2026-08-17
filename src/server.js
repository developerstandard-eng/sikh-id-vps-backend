const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[sikh-id-central-auth] listening on port ${PORT}`);
});
