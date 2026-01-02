import{Request,Response,NextFunction} from 'express';

export function authorizedMiddleWare(req:Request,res:Response,next:NextFunction){
    //express funtion can have next funtion to go to next 
    if(req.headers && req.headers.authorization==="admin"){
        return next();
    }
    return res.status(401).json(
        {success:false,message:"unauthorized"}
    )
}
