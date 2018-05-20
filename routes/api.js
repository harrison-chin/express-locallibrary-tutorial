var express = require('express');
var router = express.Router();

var Book = require('../models/book');
var Author = require('../models/author');
var Genre = require('../models/genre');
var BookInstance = require('../models/bookinstance');
var async = require('async');

var braintree = require('braintree');
var gateway = require('../lib/gateway');

var TRANSACTION_SUCCESS_STATUSES = [
  braintree.Transaction.Status.Authorizing,
  braintree.Transaction.Status.Authorized,
  braintree.Transaction.Status.Settled,
  braintree.Transaction.Status.Settling,
  braintree.Transaction.Status.SettlementConfirmed,
  braintree.Transaction.Status.SettlementPending,
  braintree.Transaction.Status.SubmittedForSettlement
];

function formatErrors(errors) {
  var formattedErrors = '';

  for (var i in errors) { // eslint-disable-line no-inner-declarations, vars-on-top
    if (errors.hasOwnProperty(i)) {
      formattedErrors += 'Error: ' + errors[i].code + ': ' + errors[i].message + '\n';
    }
  }
  return formattedErrors;
}

function createResultObject(transaction) {
  var result;
  var status = transaction.status;

  if (TRANSACTION_SUCCESS_STATUSES.indexOf(status) !== -1) {
    result = {
      header: 'Sweet Success!',
      icon: 'success',
      message: 'Your test transaction has been successfully processed. See the Braintree API response and try again.'
    };
  } else {
    result = {
      header: 'Transaction Failed',
      icon: 'fail',
      message: 'Your test transaction has a status of ' + status + '. See the Braintree API response and try again.'
    };
  }

  return result;
}

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a api resource');
});

/// API ROUTES ///

/// BOOK ROUTES ///
// GET request for list of all Book items.
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

// GET request for one Book.
router.get('/book/:id', function(request, response){
  async.parallel({
      book: function(callback) {
          Book.findById(request.params.id)
            .populate('author')
            // .populate('genre')
            .exec(callback);
      },
      book_instance: function(callback) {
          BookInstance.find({ 'book': request.params.id })
            .exec(callback);
      },
  }, function(err, results) {
      if (err) { return next(err); }
      if (results.book==null) { // No results.
          var err = new Error('Book not found');
          err.status = 404;
          return next(err);
      }
      // Successful, so render.
      // response.json(results.book + "," + results.book_instance);
      response.json(results.book);
  });
});

/// AUTHOR ROUTES ///
// GET request for list of all author items.
router.get('/authors', function(request, response){
  Author.find()
  .sort([['family_name', 'ascending']])
  .exec(function (err, list_authors) {
    if (err) { return next(err); }
    //Successful, so render
    response.json(list_authors);
  });
});

// GET request for one Author.
router.get('/author/:id', function(request, response){
  async.parallel({
      author: function(callback) {
          Author.findById(request.params.id)
            .exec(callback);
      },
      authors_books: function(callback) {
        Book.find({ 'author': request.params.id },'title summary')
        .exec(callback)
      },
  }, function(err, results) {
      if (err) { return next(err); }
      if (results.author==null) { // No results.
          var err = new Error('Author not found');
          err.status = 404;
          return next(err);
      }
      // Successful, so render.
      // response.json(results.author + "," + results.authors_books);
      response.json(results.author);
  });
});

/// GENRE ROUTES ///
// GET request for list of all genre items.
router.get('/genres', function(request, response){
  Genre.find()
  .sort([['name', 'ascending']])
  .exec(function (err, list_genres) {
    if (err) { return next(err); }
    //Successful, so render
    response.json(list_genres);
  });
});

// GET request for one Genre.
router.get('/genre/:id', function(request, response){
  async.parallel({
      genre: function(callback) {
          Genre.findById(request.params.id)
            .exec(callback);
      },
      genre_books: function(callback) {
          Book.find({ 'genre': request.params.id })
            .exec(callback);
      },
  }, function(err, results) {
      if (err) { return next(err); }
      if (results.genre==null) { // No results.
          var err = new Error('Genre not found');
          err.status = 404;
          return next(err);
      }
      // Successful, so render.
      response.json(results.genre);
  });
});

/// BOOKINSTANCE ROUTES ///
// GET request for list of all bookinstance items.
router.get('/bookinstances', function(request, response){
  BookInstance.find()
  .populate('book')
  .exec(function (err, list_bookinstances) {
    if (err) { return next(err); }
    // Successful, so render
    response.json(list_bookinstances);
  });
});

// GET request for one Bookinstance.
router.get('/bookinstance/:id', function(request, response){
  BookInstance.findById(request.params.id)
  .populate('book')
  .exec(function (err, bookinstance) {
    if (err) { return next(err); }
    if (bookinstance==null) { // No results.
        var err = new Error('Book copy not found');
        err.status = 404;
        return next(err);
      }
    // Successful, so render.
    response.json(bookinstance);
  })
});

// BRAINTREE PAYMENT ROUTES ///

// router.get('/client_token', function (req, res) {
//   gateway.clientToken.generate({}, function (err, response) {
//     res.send(response.clientToken);
//   });
// });

router.post('/braintreepay', function (req, res) {
  var transactionErrors;
  var amount = req.body.amount; // In production you should not take amounts directly from clients
  var nonce = req.body.payment_method_nonce;
  var firstName = req.body.firstName;
  var lastName = req.body.lastName;
  var email = req.body.email;

  // console.log('DEBUG amount: ' + amount);
  // console.log('DEBUG nonce: ' + nonce);
  gateway.transaction.sale({
    amount: amount,
    paymentMethodNonce: nonce,
    options: {
      submitForSettlement: true
    },
    customer: {
      firstName: firstName,
      lastName: lastName,
      email: email
    }
  }, function (err, result) {
    if (result.success || result.transaction) {
      result = "{\"success\": true}"
      res.send(result);

      // var transactionId = result.transaction.id;
      // gateway.transaction.find(transactionId, function (err, transaction) {
      //   result = createResultObject(transaction);
      //   res.send(result);
      // });
    } else {
      transactionErrors = result.errors.deepErrors();
      res.send("Error")
    }
  });
});


module.exports = router;
