//. api.js

var express = require( 'express' ),
    bodyParser = require( 'body-parser' ),
    client = require( 'cheerio-httpcli' ),
    cloudantlib = require( '@cloudant/cloudant' ),
    request = require( 'request' ),
    uuidv1 = require( 'uuid/v1' ),
    router = express.Router();
var settings = require( '../settings' );

router.use( bodyParser.urlencoded( { limit: '10mb', extended: true } ) );
router.use( bodyParser.json() );

client.set( 'browser', 'chrome' );
client.set( 'referer', false );

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

router.get( '/xframe', function( req, res ){
  var url = req.query.url;
  var tmp = url.split( '/' ); //. https://basehost/xxx
  var basehost = tmp[2];
  var encode = req.query.encode ? req.query.encode : 'UTF-8';
  client.fetch( url, {}, encode, function( err, $, res0, body ){
    if( err ){
      res.contentType( 'application/json; charset=utf-8' );
      res.status( 400 );
      res.write( JSON.stringify( err ) );
      res.end();
    }else{
      res.contentType( 'text/html; charset=UTF-8' );
      body = body.split( '<head>' ).join( '<head><base href="//' + basehost + '">' );
      body = body.split( 'charset=shift_jis' ).join( 'charset=UTF-8' );
      body = body.split( '</html>' ).join( '<script>document.onclick=function(e){return false;};document.onmouseup=function(e){return false;};</script></html>' );

      res.write( body );
      res.end();
    }
  });
});

router.post( '/item', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  //var id = uuidv1();
  var url = req.body.url;
  if( url ){
    var comment = req.body.comment;
    var ownername = settings.ownername;
    Url2Html( url ).then( html => {
      var html64 = new Buffer( html ).toString( 'base64' );

      //. （本来は先にブロックチェーンに記録して ID を取得し、その ID を指定して db.insert するべき）
      var item = {
        //_id: id,
        type: 'item',
        timestamp: ( new Date() ).getTime(),
        url: url,
        comment: comment,
        ownername: ownername,
        _attachments: {
          html: {
            content_type: 'text/html',
            data: html64
          }
        }
      };

      db.insert( item, function( err, body ){
        if( err ){
          console.log( err );
          res.status( 400 );
          res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
          res.end();
        }else{
          res.write( JSON.stringify( { status: true, message: body }, 2, null ) );
          res.end();
        }
      });
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'parameter url missing.' }, 2, null ) );
    res.end();
  }
});

router.get( '/items', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var limit = req.query.limit ? parseInt( req.query.limit ) : 0;
  var offset = req.query.offset ? parseInt( req.query.offset ) : 0;

  if( db ){
    var q = {
      selector: {
        type: { "$eq": "item" }
      }
    };
    if( limit ){ q.limit = limit; }
    if( offset ){ q.offset = offset; }
    db.find( q ).then( ( body ) => {
      //console.log( body );
      var result = { status: true, limit: limit, offset: offset, items: body.docs };
      res.write( JSON.stringify( result, 2, null ) );
      res.end();
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

router.get( '/html/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var id = req.params.id;
  if( db ){
    db.attachment.get( id, 'html', function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        res.contentType( 'text/html' );
        res.end( body, 'binary' );
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


router.delete( '/item/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var id = req.params.id;
  if( db ){
    db.get( id, function( err, doc ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        db.destroy( id, doc._rev, function( err, body ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true }, 2, null ) );
            res.end();
          }
        });
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


function getTextInfo( url, encode ){
  if( !encode ){ encode = 'UTF-8'; }
  return new Promise( function( resolve, reject ){
    client.fetch( url, {}, encode, function( err, $, res, body ){
      if( err ){
        reject( err );
      }else{
        var info = { url: url, headers: res.headers, html: body, created: parseInt( ( new Date() ).getTime() ) };
        $('head title').each( function(){
          var title = $(this).text();
          info['title'] = title;

          $('body').each( function(){
            var text = $(this).text();
            text = text.split( "\t" ).join( "" ).split( "\r" ).join( "" ).split( "\n" ).join( "" );
            info['text'] = text;

            var b3 = true;
            $('meta[property="og:image"]').each( function(){
              var image = $(this).prop('content');
              info['image'] = image;
              b3 = false;

              resolve( info );
            });
            if( b3 ){
              resolve( info );
            }
          });
        });
      }
    });
  });
}

function Url2Html( url, encode ){
  if( !encode ){ encode = 'UTF-8'; }
  return new Promise( function( resolve, reject ){
    var ts = ( new Date() ).getTime();
    var filename = ts + '.html';

    var tmp = url.split( '/' );
    var base_filename = tmp.pop();
    var base = tmp.join( '/' );
    if( !base_filename ){ base_filename = 'index.html'; }
    if( !base.endsWith( '/' ) ){ base += '/'; }

    //. main body
    client.fetch( url, {}, encode, function( err0, $, res0, body0 ){
      if( err0 ){
        reject( err0 );
      }else{
        //console.log( res0.headers );
        var title = '';
        $('head title').each( function( idx ){
          title = $(this).text();
        });
  
        //. <base>
        $('base').each( function( idx ){
          tmp = $(this).attr( 'href' ).split( '/' );
          tmp.pop();
          base = tmp.join( '/' );
          if( !base.endsWith( '/' ) ){ base += '/'; }
        });

        //. js, css, image
        $('script').each( function( idx ){
          var src = $(this).attr( 'src' );
          if( src ){
            var src_base = base;
            if( src.startsWith( '//' ) ){
              src_base = 'https:' + src;
            }else if( src.startsWith( 'http://' ) || src.startsWith( 'https://' ) ){
              src_base = src;
            }else if( src.startsWith( '/' ) ){
              tmp = base.split( '/' );
              src_base = tmp[0] + '/' + tmp[1] + '/' + tmp[2] + src;
            }else{
              src_base = base + src;
            }
  
            body0 = body0.split( src ).join( src_base );
          }
        });
    
        $('link').each( function( idx ){
          var src = $(this).attr( 'href' );
          if( src ){
            var src_base = base;
            if( src.endsWith( '.css' ) ){
              if( src.startsWith( '//' ) ){
                src_base = 'https:' + src;
              }else if( src.startsWith( 'http://' ) || src.startsWith( 'https://' ) ){
                src_base = src;
              }else if( src.startsWith( '/' ) ){
                tmp = base.split( '/' );
                src_base = tmp[0] + '/' + tmp[1] + '/' + tmp[2] + src;
              }else{
                src_base = base + src;
              }
  
              body0 = body0.split( src ).join( src_base );
            }
          }
        });
  
        var cnt3 = 0;
        $('img').each( function( idx ){
          var src = $(this).attr( 'src' );
          if( src ){ cnt3 ++; }
        });
  
        if( cnt3 > 0 ){
          var i = 0;
          $('img').each( function( idx ){
            var src = $(this).attr( 'src' );
            if( src ){
              var src_base = base;
              if( src.startsWith( '//' ) ){
                src_base = 'https:' + src;
              }else if( src.startsWith( 'http://' ) || src.startsWith( 'https://' ) ){
                src_base = src;
              }else if( src.startsWith( '/' ) ){
                tmp = base.split( '/' );
                src_base = tmp[0] + '/' + tmp[1] + '/' + tmp[2] + src;
              }else{
                src_base = base + src;
              }
  
              client.fetch( src_base, {}, function( err1, $, res1, body1 ){
                var content_type = res1['headers']['content-type'];
                request.defaults( { encoding: null } ).get( src_base, ( err2, { statusCode2, headers2 }, body2 ) => {
                  if( err2 ){
                    //console.log( err2 );
                  }else{
                    //. <img src="data:image/png;base64,XXXX...XXX"/>
                    //console.log( headers2 );
                    var b64 = new Buffer( body2 ).toString( 'base64' );
                    var imgdata = 'data:' + content_type + ';base64,' + b64;
                    body0 = body0.split( src ).join( imgdata );
                  }
    
                  i ++;
                  if( i == cnt3 ){
                    resolve( body0 );
                  }
                });
              });
            }
          });
        }else{
          resolve( body0 );
        }
      }
    });
  });
}

module.exports = router;
