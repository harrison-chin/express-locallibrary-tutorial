var express = require('express');
var router = express.Router();

var Book = require('../models/book');


/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a api resource');
});

module.exports = router;

/// API ROUTES ///
router.get('/books', function(request, response){
  // response.send('api route to get books list');
  Book.find({}, 'title author')
  .populate('author')
  .exec(function (err, list_books) {
    if (err) { return next(err); }
    //Successful, so render
    response.json(list_books);
  });
});
