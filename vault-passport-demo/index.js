require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OpenIDConnectStrategy = require('passport-openidconnect').Strategy;

const {
  PORT = 3000,
  OIDC_ISSUER,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_CALLBACK_URL,
  OIDC_AUTH_URL,
  OIDC_TOKEN_URL,
  OIDC_USERINFO_URL,
  SESSION_SECRET,
} = process.env;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  'oidc',
  new OpenIDConnectStrategy(
    {
      issuer: OIDC_ISSUER,
      authorizationURL: OIDC_AUTH_URL,
      tokenURL: OIDC_TOKEN_URL,
      userInfoURL: OIDC_USERINFO_URL || undefined,
      clientID: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      callbackURL: OIDC_CALLBACK_URL,
      scope: 'openid profile email'
    },
    (issuer, sub, profile, jwtClaims, accessToken, refreshToken, params, done) => {
      done(null, {
        sub,
        profile,
        jwtClaims,
      });
    }
  )
);

const app = express();

app.use(
  session({
    secret: SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.send(`
      <h1>Vault OIDC + Passport.js</h1>
      <p>Status: NOT logged in</p>
      <a href="/login">Login with Vault</a>
    `);
  }

  res.send(`
    <h1>Vault OIDC + Passport.js</h1>
    <p>Status: Logged in</p>
    <pre>${JSON.stringify(req.user, null, 2)}</pre>
    <a href="/logout">Logout</a>
  `);
});

app.get('/login', passport.authenticate('oidc'));

app.get('/auth/callback', (req, res, next) => {
  passport.authenticate('oidc', (err, user, info) => {
    if (err) return res.status(500).send(`OIDC error: ${err.message || err}`);
    if (!user) return res.status(401).send(`No user. info=${JSON.stringify(info)}`);
    req.logIn(user, (err2) => {
      if (err2) return res.status(500).send(`Login error: ${err2.message || err2}`);
      return res.redirect('/');
    });
  })(req, res, next);
});

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/'));
  });
});

app.listen(PORT, () => {
  console.log(`Listening on http://0.0.0.0:${PORT}`);
});
