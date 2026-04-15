

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if(!token){
        return res.status(401).json({erro: 'token nao encontrado'})
    }


try{
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();

}catch(error){
    return res.status(401).json({erro: 'token invalido'})
}
 }
