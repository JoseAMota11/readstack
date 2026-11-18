import Link from 'next/link';

function Footer() {
  return (
    <footer>
      <p className="site-attribution">
        Hecho por{' '}
        <Link href="https://github.com/JoseAMota11">
          José Mota ♥️
        </Link>
      </p>
    </footer>
  );
}

export default Footer;
