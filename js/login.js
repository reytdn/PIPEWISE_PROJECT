$(document).ready(function () {

    // 61 barangays of Bacolod City
    var barangays = ['Alangilan', 'Alijis', 'Banago'];
    for (var i = 1; i <= 41; i++) {
        barangays.push('Barangay ' + i);
    }
    barangays = barangays.concat(['Bata', 'Cabug', 'Estefania', 'Felisa', 'Granada', 'Handumanan',
        'Mandalagan', 'Mansilingan', 'Montevista', 'Pahanocoy', 'Punta Taytay',
        'Singcang-Airport', 'Sum-ag', 'Taculing', 'Tangub', 'Villamonte', 'Vista Alegre']);

    barangays.forEach(function (name) {
        $('#signupAddress').append($('<option>').val(name).text(name));
    });

    // already logged in? go straight to the dashboard
    $.ajax({
        url: "forms/get_user.php",
        type: "GET",
        success: function (response) {
            var res = JSON.parse(response);
            if (res.status === "success") {
                window.location.href = "dashboard.html";
            }
        }
    });


    // ---------- show one form at a time ----------
    function showForm(which) {
        $('#residentForm, #registerForm, #adminForm').prop('hidden', true);
        $('#segResident, #segAdmin').removeClass('is-active');

        if (which === 'resident') {
            $('#residentForm').prop('hidden', false);
            $('#segResident').addClass('is-active');
            $('#roleSwitch').prop('hidden', false);
            $('#gateTitle').text('Log in');
            $('#gateLead').text('Choose how you are using PipeSense.');
        } else if (which === 'admin') {
            $('#adminForm').prop('hidden', false);
            $('#segAdmin').addClass('is-active');
            $('#roleSwitch').prop('hidden', false);
            $('#gateTitle').text('Log in');
            $('#gateLead').text('Choose how you are using PipeSense.');
        } else {
            $('#registerForm').prop('hidden', false);
            $('#roleSwitch').prop('hidden', true);
            $('#gateTitle').text('Create your account');
            $('#gateLead').text('Residents can report water service issues and follow them on the map.');
        }
    }

    $('#segResident, #backToLogin').click(function () { showForm('resident'); });
    $('#segAdmin').click(function () { showForm('admin'); });
    $('#showSignup').click(function () { showForm('signup'); });

    // index.html has a "Sign up" button that links to login.html#signup
    if (window.location.hash === '#signup') {
        showForm('signup');
    } else {
        showForm('resident');
    }


    // ---------- resident log in ----------
    $('#residentForm').submit(function (e) {
        e.preventDefault();

        var username = $.trim($('#residentForm [name=username]').val());
        var password = $('#residentForm [name=password]').val();

        if (username === '' || password === '') {
            Swal.fire('Missing details', 'Enter your username (or email) and your password.', 'warning');
            return;
        }

        $.ajax({
            url: "forms/login_user.php",
            type: "POST",
            data: { username: username, password: password },
            success: function (response) {
                loginReply(response);
            },
            error: function () {
                Swal.fire('Cannot reach the server', 'Make sure Apache and MySQL are running, and open this page from http://localhost/...', 'error');
            }
        });
    });


    // ---------- admin log in ----------
    $('#adminForm').submit(function (e) {
        e.preventDefault();

        var username = $.trim($('#adminForm [name=username]').val());
        var password = $('#adminForm [name=password]').val();

        if (username === '' || password === '') {
            Swal.fire('Missing details', 'Enter the administrator username and password.', 'warning');
            return;
        }

        $.ajax({
            url: "forms/login_admin.php",
            type: "POST",
            data: { username: username, password: password },
            success: function (response) {
                loginReply(response);
            },
            error: function () {
                Swal.fire('Cannot reach the server', 'Make sure Apache and MySQL are running, and open this page from http://localhost/...', 'error');
            }
        });
    });

    // both log in forms get the same kind of answer
    function loginReply(response) {
        var res;
        try {
            res = JSON.parse(response);
        } catch (e) {
            // PHP printed an error instead of JSON, show what it said
            Swal.fire('Server problem', String(response).replace(/<[^>]*>/g, ' ').slice(0, 200), 'error');
            return;
        }

        if (res.status === "success") {
            sessionStorage.removeItem('welcomed');
            window.location.href = "dashboard.html";
        } else {
            Swal.fire('Failed to login', res.message, 'error');
        }
    }


    // ---------- sign up ----------
    $('#registerForm').submit(function (e) {
        e.preventDefault();

        var data = {
            username: $.trim($('#registerForm [name=username]').val()),
            password: $('#registerForm [name=password]').val(),
            name: $.trim($('#registerForm [name=name]').val()),
            address: $('#registerForm [name=address]').val(),
            email: $.trim($('#registerForm [name=email]').val())
        };

        if (data.username === '' || data.password === '' || data.name === '' || data.address === '' || data.email === '') {
            Swal.fire('Missing details', 'Every field is required, including your barangay.', 'warning');
            return;
        }
        if (data.password.length < 8) {
            Swal.fire('Check your details', 'Password must be at least 8 characters.', 'warning');
            return;
        }

        $.ajax({
            url: "forms/add_user.php",
            type: "POST",
            data: data,
            success: function (response) {
                var res;
                try {
                    res = JSON.parse(response);
                } catch (e) {
                    Swal.fire('Server problem', String(response).replace(/<[^>]*>/g, ' ').slice(0, 200), 'error');
                    return;
                }

                if (res.status === "success") {
                    Swal.fire('Account created', res.message, 'success').then(function () {
                        $('#registerForm')[0].reset();
                        showForm('resident');
                        $('#residentForm [name=username]').val(data.username);
                        $('#residentForm [name=password]').focus();
                    });
                } else {
                    Swal.fire('Could not create your account', res.message, 'error');
                }
            },
            error: function () {
                Swal.fire('Cannot reach the server', 'Make sure Apache and MySQL are running.', 'error');
            }
        });
    });

});
