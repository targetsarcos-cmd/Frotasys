document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('login-form');
  const email = document.getElementById('login-email');
  const password = document.getElementById('login-password');
  const error = document.getElementById('login-error');
  const button = document.getElementById('login-submit');
  const next = new URLSearchParams(location.search).get('next') || '/';

  const current = await FrotasysAuth.init({ requireAuth: false });
  if (current.profile?.ativo) {
    location.replace(next);
    return;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Entrando...';

    try {
      const data = await FrotasysAuth.signIn(email.value.trim(), password.value);
      if (!data?.profile?.ativo) {
        await FrotasysAuth.signOut(false);
        error.textContent = 'Usuário inativo ou não autorizado.';
        return;
      }
      location.replace(next);
    } catch (err) {
      error.textContent = 'E-mail ou senha incorretos.';
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });
});
