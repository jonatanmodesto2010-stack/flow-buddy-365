import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/contexts/ThemeContext';
import { authSchema } from '@/lib/validations';
import { z } from 'zod';
import { Eye, EyeOff, Sun, Moon, TrendingUp, Users, BarChart3, PieChart } from 'lucide-react';

const DashboardShowcase = () => (
  <div className="hidden md:flex w-[60%] relative overflow-hidden bg-gradient-to-br from-[#0f0a2e] via-[#1a1145] to-[#0d1b3e] flex-col justify-center items-center p-12">
    {/* Decorative stars/dots */}
    {Array.from({ length: 30 }).map((_, i) => (
      <div
        key={i}
        className="absolute rounded-full bg-white"
        style={{
          width: `${Math.random() * 3 + 1}px`,
          height: `${Math.random() * 3 + 1}px`,
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
          opacity: Math.random() * 0.4 + 0.1,
        }}
      />
    ))}

    {/* Glow effect */}
    <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px]" />


    {/* Floating screenshots */}
    <div className="relative z-10 w-full max-w-2xl h-[420px]">
      {/* Clients screenshot */}
      <img
        src="/images/showcase-clients.png"
        alt="Gestão de Clientes"
        className="absolute top-0 left-0 w-[55%] rounded-xl shadow-2xl border border-white/10 transform -rotate-2 hover:rotate-0 transition-transform duration-500"
      />
      {/* Calendar screenshot */}
      <img
        src="/images/showcase-calendar.png"
        alt="Calendário de Ações"
        className="absolute top-4 right-0 w-[50%] rounded-xl shadow-2xl border border-white/10 transform rotate-3 hover:rotate-0 transition-transform duration-500"
      />
      {/* Timeline screenshot */}
      <img
        src="/images/showcase-timeline.png"
        alt="Timeline Completa"
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] rounded-xl shadow-2xl border border-white/10 transform rotate-1 hover:rotate-0 transition-transform duration-500"
      />
    </div>

    {/* Marketing text */}
    <div className="relative z-10 mt-8 text-center max-w-md">
      <h2 className="text-2xl font-bold text-white mb-2">
        Gestão inteligente de cobranças
      </h2>
      <p className="text-sm text-purple-200/70">
        Controle de clientes, calendário de ações e timeline completa em um só lugar
      </p>
    </div>
  </div>
);

const Auth = () => {
  const [isLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const remembered = localStorage.getItem('remembered_email');
    if (remembered) {
      setEmail(remembered);
      setRememberEmail(true);
    }
  }, []);

  useEffect(() => {
    const resetParam = searchParams.get('reset');
    if (resetParam === 'true') {
      setIsResetMode(true);
      setIsForgotPassword(false);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isResetMode) {
        navigate('/');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event !== 'PASSWORD_RECOVERY') {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams, isResetMode]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      z.object({ email: authSchema.shape.email }).parse({ email });

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      
      setIsForgotPassword(false);
      setEmail('');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { [key: string]: string } = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      authSchema.shape.password.parse(password);

      if (password !== confirmPassword) {
        setErrors({ confirmPassword: 'As senhas não coincidem' });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast({
        title: 'Senha atualizada!',
        description: 'Sua senha foi redefinida com sucesso.',
      });

      navigate('/');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { [key: string]: string } = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const validationData = isLogin 
        ? { email, password }
        : { email, password, fullName };
      
      authSchema.parse(validationData);

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Handle remember email
        if (rememberEmail) {
          localStorage.setItem('remembered_email', email);
        } else {
          localStorage.removeItem('remembered_email');
        }

        toast({
          title: 'Login realizado com sucesso!',
          description: 'Bem-vindo de volta.',
        });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        toast({
          title: 'Cadastro realizado!',
          description: 'Você já pode fazer login.',
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { [key: string]: string } = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const renderLoginForm = () => (
    <form onSubmit={handleAuth} className="space-y-5">
      {!isLogin && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Nome Completo</Label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required={!isLogin}
            placeholder="Seu nome"
            className={`h-11 rounded-xl bg-muted/50 border-border/50 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.fullName ? 'border-destructive' : ''}`}
          />
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="seu@email.com"
          className={`h-11 rounded-xl bg-muted/50 border-border/50 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.email ? 'border-destructive' : ''}`}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            minLength={6}
            className={`h-11 rounded-xl bg-muted/50 border-border/50 pr-10 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.password ? 'border-destructive' : ''}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={rememberEmail}
            onCheckedChange={(checked) => setRememberEmail(checked === true)}
          />
          <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
            Lembrar e-mail
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsForgotPassword(true);
            setErrors({});
          }}
          className="text-sm text-primary hover:underline transition-colors"
        >
          Esqueceu a senha?
        </button>
      </div>

      <Button
        type="submit"
        className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        disabled={loading}
      >
        {loading ? 'Carregando...' : isLogin ? 'Entrar' : 'Cadastrar'}
      </Button>
    </form>
  );

  const renderForgotForm = () => (
    <form onSubmit={handleForgotPassword} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="seu@email.com"
          className={`h-11 rounded-xl bg-muted/50 border-border/50 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.email ? 'border-destructive' : ''}`}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        disabled={loading}
      >
        {loading ? 'Carregando...' : 'Enviar Link de Recuperação'}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setIsForgotPassword(false);
            setErrors({});
          }}
          className="text-sm text-primary hover:underline"
        >
          Voltar para login
        </button>
      </div>
    </form>
  );

  const renderResetForm = () => (
    <form onSubmit={handleResetPassword} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="password">Nova Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            minLength={6}
            className={`h-11 rounded-xl bg-muted/50 border-border/50 pr-10 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.password ? 'border-destructive' : ''}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar Senha</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="••••••••"
          minLength={6}
          className={`h-11 rounded-xl bg-muted/50 border-border/50 transition-all focus:ring-2 focus:ring-primary/50 focus:shadow-lg ${errors.confirmPassword ? 'border-destructive' : ''}`}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-semibold transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]"
        disabled={loading}
      >
        {loading ? 'Carregando...' : 'Redefinir Senha'}
      </Button>
    </form>
  );

  const getTitle = () => {
    if (isResetMode) return 'Redefinir Senha';
    if (isForgotPassword) return 'Recuperar Senha';
    return 'Entre em sua conta';
  };

  const getSubtitle = () => {
    if (isResetMode) return 'Digite sua nova senha para continuar';
    if (isForgotPassword) return 'Digite seu email para receber o link de recuperação';
    return 'Gerencie seus clientes e operações com eficiência';
  };

  return (
    <div className="min-h-screen flex">
      <DashboardShowcase />

      {/* Right column - Login */}
      <div className="w-full md:w-[40%] flex flex-col bg-background">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-3 p-4">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            🇧🇷 Português
          </span>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center px-6 md:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm"
          >
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <div className="bg-white rounded-2xl px-6 py-4">
                <img src="/images/logo-provedor-ligado.png" alt="Provedor Ligado" className="h-36 drop-shadow-lg" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-1">
                {getTitle()}
              </h1>
              <p className="text-sm text-muted-foreground">
                {getSubtitle()}
              </p>
            </div>

            {/* Forms */}
            {isResetMode
              ? renderResetForm()
              : isForgotPassword
              ? renderForgotForm()
              : renderLoginForm()}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} Sistema de Gestão
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
