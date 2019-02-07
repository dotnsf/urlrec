//. app.js
var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    cfenv = require( 'cfenv' ),
    cheerio = require( 'cheerio-httpcli' ),
    cloudantlib = require( '@cloudant/cloudant' ),
    ejs = require( 'ejs' ),
    fs = require( 'fs' ),
    request = require( 'request' ),
    app = express();
var settings = require( './settings' );
var api = require( './routes/api' );

var appEnv = cfenv.getAppEnv();

app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

app.use( '/api', api );

var db = null;
var cloudant = cloudantlib( { account: settings.db_username, password: settings.db_password } );
if( cloudant ){
  cloudant.db.get( settings.db_name, function( err, body ){
    if( err ){
      if( err.statusCode == 404 ){
        cloudant.db.create( settings.db_name, function( err, body ){
          if( err ){
            db = null;
          }else{
            db = cloudant.db.use( settings.db_name );
          }
        });
      }else{
        db = cloudant.db.use( settings.db_name );
      }
    }else{
      db = cloudant.db.use( settings.db_name );
    }
  });
}


app.get( '/', function( req, res ){
  res.render( 'index', {} );
});

/*
app.get( '/admin', function( req, res ){
  res.render( 'admin', {} );
});
*/

app.get( '/single/:id', function( req, res ){
  var id = req.params.id;
  if( db ){
    db.get( id, function( err, item ){
      if( err ){
        res.render( 'single', { id: id, item: null } );
      }else{
        item.datetime = timestamp2datetime( item.timestamp );
        res.render( 'single', { id: id, item: item } );
      }
    });
  }else{
    res.render( 'single', { id: id, item: null } );
  }
});

function timestamp2datetime( ts ){
  var dt = new Date( ts );
  var yyyy = dt.getFullYear();
  var mm = dt.getMonth() + 1;
  var dd = dt.getDate();
  var hh = dt.getHours();
  var nn = dt.getMinutes();
  var ss = dt.getSeconds();
  var datetime = yyyy + '-' + ( mm < 10 ? '0' : '' ) + mm + '-' + ( dd < 10 ? '0' : '' ) + dd
    + ' ' + ( hh < 10 ? '0' : '' ) + hh + ':' + ( nn < 10 ? '0' : '' ) + nn + ':' + ( ss < 10 ? '0' : '' ) + ss;
  return datetime;
}


app.listen( appEnv.port );
console.log( "server stating on " + appEnv.port + " ..." );

