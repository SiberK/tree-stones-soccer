export class GameMath {
    /**
     * ��������� ���������� ����� �� ����������� ������������� (�����)
     * ���������� ����� �����-�������
     */
    static randomGaussian(mean, stdDev) {
        let u1 = 1 - Math.random();
        let u2 = 1 - Math.random();
        let randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return mean + randStdNormal * stdDev;
    }
    /**
     * �������� ����������� ���� ��������
     * ���������� true, ���� ������� ������������ ������ ������ (�� � ������)
     */
    static checkLineIntersection(a, b, c, d) {
        const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(det) < 1e-10)
            return false; // ������������ �����
        const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
        const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
        // ������� ����������� ������ �������� (0 < t < 1)
        return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
    }
    /**
     * ���������� ����� ����� �������
     */
    static distance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    /**
     * ������������ �������
     */
    static normalize(v) {
        const len = Math.hypot(v.x, v.y);
        if (len === 0)
            return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }
    /**
     * ��������� ������������ ��������
     */
    static dotProduct(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    }
    /**
     * ����������� �������� � ��������� [min, max]
     */
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}
//# sourceMappingURL=math.js.map