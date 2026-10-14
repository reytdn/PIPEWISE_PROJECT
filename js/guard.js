(function () {
  var role = document.currentScript.getAttribute('data-role');
  try {
    var u = JSON.parse(sessionStorage.getItem('pipesense.user'));
    if (!u) location.replace('login.html');
    else if (role === 'admin' && u.role !== 'admin') location.replace('user_dashboard.html');
    else if (role === 'resident' && u.role === 'admin') location.replace('admin_dashboard.html');
  } catch (e) { location.replace('login.html'); }
})();
