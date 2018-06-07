var Book = require('../models/book');
var Author = require('../models/author');
var Genre = require('../models/genre');
var BookInstance = require('../models/bookinstance');
var async = require('async');

const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');

exports.index = function(req, res) {

    async.parallel({
        book_count: function(callback) {
            Book.count({}, callback); // Pass an empty object as match condition to find all documents of this collection
        },
        book_instance_count: function(callback) {
            BookInstance.count({}, callback);
        },
        book_instance_available_count: function(callback) {
            BookInstance.count({status:'Available'}, callback);
        },
        author_count: function(callback) {
            Author.count({}, callback);
        },
        genre_count: function(callback) {
            Genre.count({}, callback);
        },
    }, function(err, results) {
        res.render('index', { title: 'Local Library Home', error: err, data: results });
    });
};

// Display list of all books.
exports.book_list = function(req, res) {

  Book.find({}, 'title author')
  .populate('author')
  .exec(function (err, list_books) {
    if (err) { return next(err); }
    //Successful, so render
    res.render('book_list', { title: 'Book List', book_list: list_books });
  });
};

// Display detail page for a specific book.
exports.book_detail = function(req, res) {
  async.parallel({
      book: function(callback) {

          Book.findById(req.params.id)
            .populate('author')
            .populate('genre')
            .exec(callback);
      },
      book_instance: function(callback) {

        BookInstance.find({ 'book': req.params.id })
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
      res.render('book_detail', { title: 'Title', book:  results.book, book_instances: results.book_instance } );
  });
};

// Display book create form on GET.
exports.book_create_get = function(req, res) {
  async.parallel({
     authors: function(callback) {
         Author.find(callback);
     },
     genres: function(callback) {
         Genre.find(callback);
     },
 }, function(err, results) {
     if (err) { return next(err); }
     res.render('book_form', { title: 'Create Book', authors: results.authors, genres: results.genres });
 });
};

// Handle book create on POST.
exports.book_create_post = [
    // Convert the genre to an array.
    (req, res, next) => {
        if(!(req.body.genre instanceof Array)){
            if(typeof req.body.genre==='undefined')
            req.body.genre=[];
            else
            req.body.genre=new Array(req.body.genre);
        }
        next();
    },

    // Validate fields.
    body('title', 'Title must not be empty.').isLength({ min: 1 }).trim(),
    body('author', 'Author must not be empty.').isLength({ min: 1 }).trim(),
    body('summary', 'Summary must not be empty.').isLength({ min: 1 }).trim(),
    body('isbn', 'ISBN must not be empty').isLength({ min: 1 }).trim(),
    body('price', 'Price must not be empty.').isLength({ min: 1 }).trim(),

    // Sanitize fields (using wildcard).
    sanitizeBody('*').trim().escape(),

    // Process request after validation and sanitization.
    (req, res, next) => {

        // Extract the validation errors from a request.
        const errors = validationResult(req);

        // Create a Book object with escaped and trimmed data.
        var book = new Book(
          { title: req.body.title,
            author: req.body.author,
            summary: req.body.summary,
            isbn: req.body.isbn,
            price: req.body.price,
            genre: req.body.genre
           });

        if (!errors.isEmpty()) {
            // There are errors. Render form again with sanitized values/error messages.

            // Get all authors and genres for form.
            async.parallel({
                authors: function(callback) {
                    Author.find(callback);
                },
                genres: function(callback) {
                    Genre.find(callback);
                },
            }, function(err, results) {
                if (err) { return next(err); }

                // Mark our selected genres as checked.
                for (let i = 0; i < results.genres.length; i++) {
                    if (book.genre.indexOf(results.genres[i]._id) > -1) {
                        results.genres[i].checked='true';
                    }
                }
                res.render('book_form', { title: 'Create Book',authors:results.authors, genres:results.genres, book: book, errors: errors.array() });
            });
            return;
        }
        else {
            // Data from form is valid. Save book.
            book.save(function (err) {
                if (err) { return next(err); }
                   //successful - redirect to new book record.
                   res.redirect(book.url);
                });
        }
    }
];

// Display book delete form on GET.
exports.book_delete_get = function(req, res, next) {

    async.parallel({
        book: function(callback) {
            Book.findById(req.params.id).exec(callback)
        },
        books_bookinstances: function(callback) {
          BookInstance.find({ 'book': req.params.id }).exec(callback)
        },
    }, function(err, results) {
        if (err) { return next(err); }
        if (results.book==null) { // No results.
            res.redirect('/catalog/books');
        }
        // Successful, so render.
        res.render('book_delete', { title: 'Delete Book', book: results.book, book_bookinstances: results.books_bookinstances } );
    });

};

// Handle book delete on POST.
exports.book_delete_post = function(req, res, next) {

    async.parallel({
        book: function(callback) {
          Book.findById(req.body.bookid).exec(callback)
        },
        books_bookinstances: function(callback) {
          BookInstance.find({ 'book': req.body.bookid }).exec(callback)
        },
    }, function(err, results) {
        if (err) { return next(err); }
        // Success
        if (results.books_bookinstances.length > 0) {
            // Book has bookinstances. Render in same way as for GET route.
            res.render('book_delete', { title: 'Delete Book', book: results.book, book_bookinstances: results.books_bookinstances } );
            return;
        }
        else {
            // Book has no bookinstancess. Delete object and redirect to the list of books.
            Book.findByIdAndRemove(req.body.bookid, function deleteBook(err) {
                if (err) { return next(err); }
                // Success - go to book list
                res.redirect('/catalog/books')
            })
        }
    });
};

// Display book update form on GET.
exports.book_update_get = function(req, res, next) {

  Genre.findById(req.params.id, function(err, genre) {
      if (err) { return next(err); }
      if (genre==null) { // No results.
          var err = new Error('Genre not found');
          err.status = 404;
          return next(err);
      }
      // Success.
      res.render('genre_form', { title: 'Update Genre', genre: genre });
  });
};

// Handle book update on POST.
exports.book_update_post = [

  // Validate that the name field is not empty.
  body('name', 'Genre name required').isLength({ min: 1 }).trim(),

  // Sanitize (trim and escape) the name field.
  sanitizeBody('name').trim().escape(),

  // Process request after validation and sanitization.
  (req, res, next) => {

      // Extract the validation errors from a request .
      const errors = validationResult(req);

  // Create a genre object with escaped and trimmed data (and the old id!)
      var genre = new Genre(
        {
        name: req.body.name,
        _id: req.params.id
        }
      );


      if (!errors.isEmpty()) {
          // There are errors. Render the form again with sanitized values and error messages.
          res.render('genre_form', { title: 'Update Genre', genre: genre, errors: errors.array()});
      return;
      }
      else {
          // Data from form is valid. Update the record.
          Genre.findByIdAndUpdate(req.params.id, genre, {}, function (err,thegenre) {
              if (err) { return next(err); }
                 // Successful - redirect to genre detail page.
                 res.redirect(thegenre.url);
              });
      }
  }
];
